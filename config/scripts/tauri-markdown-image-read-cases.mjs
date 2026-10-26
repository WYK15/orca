import { it, expect } from 'vitest'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

export function registerTauriMarkdownImageReadTest(scope) {
  it('renders external Markdown images without granting ordinary filesystem access', async () => {
    const { call, project, directory } = scope()
    const documentPath = join(project, 'note.md')
    const imagePath = join(directory, 'outside.png')
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII='
    await writeFile(documentPath, `![image](${imagePath})`)
    await writeFile(imagePath, Buffer.from(png, 'base64'))
    await call('repos:add', [{ path: project, kind: 'folder' }])
    await expect(call('fs:readFile', [{ filePath: imagePath }])).rejects.toThrow('Access denied')
    expect(await call('fs:readMarkdownImage', [{ documentPath, imagePath }])).toEqual({
      content: png,
      isBinary: true,
      isImage: true,
      mimeType: 'image/png'
    })
    await expect(call('fs:readFile', [{ filePath: imagePath }])).rejects.toThrow('Access denied')
    await writeFile(imagePath, 'plain text renamed to png')
    await expect(call('fs:readMarkdownImage', [{ documentPath, imagePath }])).rejects.toThrow(
      'not a supported image'
    )
  })
}
