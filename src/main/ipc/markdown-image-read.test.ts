import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Store } from '../persistence'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
import { readMarkdownImage } from './markdown-image-read'
import { invalidateAuthorizedRootsCache, resolveAuthorizedPath } from './filesystem-auth'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=',
  'base64'
)
let directory: string, documentPath: string, imagePath: string, store: Store
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orcaw-md-image-'))
  const project = join(directory, 'project')
  await mkdir(project)
  documentPath = join(project, 'note.md')
  imagePath = join(directory, 'outside.png')
  await writeFile(documentPath, `![outside](${imagePath})`)
  await writeFile(imagePath, png)
  store = {
    getRepos: () => [{ id: 'folder', path: project, kind: 'folder' }],
    getSettings: () => ({})
  } as unknown as Store
  invalidateAuthorizedRootsCache()
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
  invalidateAuthorizedRootsCache()
})
it('reads a referenced external image without granting ordinary file access', async () => {
  await expect(resolveAuthorizedPath(imagePath, store)).rejects.toThrow('Access denied')
  expect(await readMarkdownImage(store, { documentPath, imagePath })).toEqual({
    content: png.toString('base64'),
    isBinary: true,
    isImage: true,
    mimeType: 'image/png'
  })
  await expect(resolveAuthorizedPath(imagePath, store)).rejects.toThrow('Access denied')
})
it('requires an authorized existing Markdown source file', async () => {
  const outside = join(directory, 'outside.md')
  await writeFile(outside, '# Outside')
  await expect(readMarkdownImage(store, { documentPath: outside, imagePath })).rejects.toThrow(
    'Access denied'
  )
  await expect(
    readMarkdownImage(store, { documentPath: join(directory, 'project/missing.md'), imagePath })
  ).rejects.toThrow('ENOENT')
  await expect(
    readMarkdownImage(store, { documentPath: documentPath.replace('.md', '.txt'), imagePath })
  ).rejects.toThrow('Invalid Markdown')
})
it('does not read text disguised as an image or a symlink to text', async () => {
  await writeFile(imagePath, 'private text')
  await expect(readMarkdownImage(store, { documentPath, imagePath })).rejects.toThrow(
    'not a supported image'
  )
  if (process.platform === 'win32') {
    return
  }
  const link = join(directory, 'project/link.png')
  await symlink(imagePath, link)
  await expect(readMarkdownImage(store, { documentPath, imagePath: link })).rejects.toThrow(
    'not a supported image'
  )
})
it.skipIf(process.platform === 'win32')(
  'does not authorize an outside Markdown source through an in-project symlink',
  async () => {
    const outside = join(directory, 'outside.md')
    await writeFile(outside, '# Outside')
    const link = join(directory, 'project/link.md')
    await symlink(outside, link)
    await expect(readMarkdownImage(store, { documentPath: link, imagePath })).rejects.toThrow(
      'Access denied'
    )
  }
)
it('bounds file size and rejects directories before reading', async () => {
  const file = await open(imagePath, 'r+')
  await file.truncate(50 * 1024 * 1024 + 1)
  await file.close()
  await expect(readMarkdownImage(store, { documentPath, imagePath })).rejects.toThrow('50MB')
  await expect(readMarkdownImage(store, { documentPath, imagePath: directory })).rejects.toThrow(
    'must be a file'
  )
})
it.each([
  ['svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>', 'image/svg+xml'],
  ['gif', 'GIF89a', 'image/gif'],
  ['webp', 'RIFF0000WEBP', 'image/webp'],
  ['avif', '0000ftypavif0000', 'image/avif']
])('detects %s image content', async (extension, bytes, mimeType) => {
  const target = join(directory, `image.${extension}`)
  await writeFile(target, bytes)
  expect((await readMarkdownImage(store, { documentPath, imagePath: target })).mimeType).toBe(
    mimeType
  )
})
it.each(['relative.png', '', 'bad\0.png'])('rejects malformed image paths: %s', async (value) => {
  await expect(readMarkdownImage(store, { documentPath, imagePath: value })).rejects.toThrow(
    'Invalid Markdown'
  )
})
