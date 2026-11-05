import { it, expect } from 'vitest'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

export function registerTauriFileClipboardTests(scope) {
  it('pastes native file references into a folder workspace without overwriting existing files', async () => {
    const { call, directory, project, nativeResponses } = scope()
    const file = join(directory, '中文 文件.md')
    const folder = join(directory, 'a folder')
    await mkdir(folder)
    await writeFile(file, 'original file')
    await writeFile(join(folder, 'nested.txt'), 'nested content')
    await writeFile(join(project, '中文 文件.md'), 'existing file')
    await call('repos:add', [{ path: project, kind: 'folder' }])
    nativeResponses.set('clipboard-read-files', [file, folder, file])
    const paths = await call('clipboard:readFiles')
    expect(paths).toEqual([file, folder])
    const result = await call('fs:importExternalPaths', [{ sourcePaths: paths, destDir: project }])
    expect(result.results.map((item) => item.status)).toEqual(['imported', 'imported'])
    expect(await readFile(join(project, '中文 文件.md'), 'utf8')).toBe('existing file')
    expect(await readFile(join(project, '中文 文件 copy.md'), 'utf8')).toBe('original file')
    expect(await readFile(join(project, 'a folder', 'nested.txt'), 'utf8')).toBe('nested content')
    expect(await readFile(file, 'utf8')).toBe('original file')
    const again = await call('fs:importExternalPaths', [{ sourcePaths: paths, destDir: project }])
    expect(again.results.map((item) => item.status)).toEqual(['imported', 'imported'])
    expect(await readFile(join(project, 'a folder copy', 'nested.txt'), 'utf8')).toBe(
      'nested content'
    )
    expect(await readFile(join(project, '中文 文件 copy 2.md'), 'utf8')).toBe('original file')
  })

  it('rejects malformed clipboard lists, unauthorized destinations and recursive folder pastes', async () => {
    const { call, directory, project, nativeResponses } = scope()
    nativeResponses.set('clipboard-read-files', '/plain/text/path')
    await expect(call('clipboard:readFiles')).rejects.toThrow('Invalid native clipboard file list')
    await call('repos:add', [{ path: project, kind: 'folder' }])
    const outside = join(directory, 'outside')
    const child = join(project, 'child')
    await mkdir(outside)
    await mkdir(child)
    await expect(
      call('fs:importExternalPaths', [{ sourcePaths: [project], destDir: outside }])
    ).rejects.toThrow('Access denied')
    for (const destination of [project, child]) {
      const result = await call('fs:importExternalPaths', [
        { sourcePaths: [project], destDir: destination }
      ])
      expect(result.results).toMatchObject([
        { status: 'failed', reason: 'Cannot copy a folder into itself or its subfolder' }
      ])
    }
  })
}
