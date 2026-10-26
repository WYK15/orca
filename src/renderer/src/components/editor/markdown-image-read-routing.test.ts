// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import {
  getLocalImageCacheKey,
  loadLocalImageSrc,
  resetLocalImageSrcStateForTests
} from './useLocalImageSrc'
import { readRuntimeFilePreview } from '@/runtime/runtime-file-client'
vi.mock('@/runtime/runtime-file-client', () => ({ readRuntimeFilePreview: vi.fn() }))

const readMarkdownImage = vi.fn()
const readFile = vi.fn()
const preview = { content: 'AA==', isBinary: true, isImage: true, mimeType: 'image/png' }
const context = {
  settings: { activeRuntimeEnvironmentId: null as string | null },
  worktreeId: 'wt-1',
  worktreePath: '/project',
  sourceMarkdownPath: '/project/note.md'
}
beforeEach(() => {
  resetLocalImageSrcStateForTests()
  vi.clearAllMocks()
  window.api = { fs: { readMarkdownImage, readFile } } as unknown as Window['api']
  readMarkdownImage.mockResolvedValue(preview)
  vi.mocked(readRuntimeFilePreview).mockResolvedValue(preview)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:markdown-image')
})
afterEach(() => {
  resetLocalImageSrcStateForTests()
  vi.restoreAllMocks()
})
it('loads absolute paths outside a local Markdown workspace through image-only IPC', async () => {
  const path = '/Users/leo/Desktop/tmp/mc-PixPin_2026-10-20_11-18-38.png'
  expect(await loadLocalImageSrc(path, context.sourceMarkdownPath, undefined, context)).toBe(
    'blob:markdown-image'
  )
  expect(readMarkdownImage).toHaveBeenCalledWith({
    documentPath: '/project/note.md',
    imagePath: path
  })
  expect(readRuntimeFilePreview).not.toHaveBeenCalled()
  expect(readFile).not.toHaveBeenCalled()
})
it('resolves encoded relative paths with the same reader', async () => {
  await loadLocalImageSrc(
    '../images/pic%20%231.png',
    context.sourceMarkdownPath,
    undefined,
    context
  )
  expect(readMarkdownImage).toHaveBeenCalledWith({
    documentPath: '/project/note.md',
    imagePath: '/images/pic #1.png'
  })
})
it('keeps the authorizing Markdown document in the image cache scope', () => {
  const key = getLocalImageCacheKey('/outside/image.png', undefined, context)
  expect(key).not.toBe(
    getLocalImageCacheKey('/outside/image.png', undefined, {
      ...context,
      sourceMarkdownPath: '/project/other.md'
    })
  )
})
it.each([
  { ...context, connectionId: 'ssh-1', expectedExternalSshTargetId: 'ssh-1' },
  { ...context, settings: { activeRuntimeEnvironmentId: 'env-1' } }
])('retains the owning host route for remote Markdown: %j', async (owner) => {
  await loadLocalImageSrc('/server/image.png', context.sourceMarkdownPath, undefined, owner)
  expect(readRuntimeFilePreview).toHaveBeenCalledWith(
    expect.objectContaining(owner),
    '/server/image.png'
  )
  expect(readMarkdownImage).not.toHaveBeenCalled()
})
it('does not fall back to an unrestricted read when an image request fails', async () => {
  readMarkdownImage.mockRejectedValueOnce(new Error('File is not a supported image'))
  expect(
    await loadLocalImageSrc('/outside/secret.png', context.sourceMarkdownPath, undefined, context)
  ).toBeNull()
  expect(readFile).not.toHaveBeenCalled()
  expect(readRuntimeFilePreview).not.toHaveBeenCalled()
})
