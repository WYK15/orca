import { it, expect } from 'vitest'
import { join } from 'node:path'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'

export function registerTauriFileDragTests(scope) {
  it('starts native file and folder drags after authorization without changing source files', async () => {
    const { call, project, nativeRequests, nativeResponses } = scope()
    if (process.platform !== 'darwin') {
      return
    }
    await call('repos:add', [{ path: project, kind: 'folder' }])
    const file = join(project, '中文 file # %.md')
    const folder = join(project, 'nested folder')
    await mkdir(folder)
    await writeFile(file, 'original')
    await writeFile(join(folder, 'child.txt'), 'nested')
    nativeResponses.set('file-drag-start', { outcome: 'copied' })
    const result = await call('ui:startFileDrag', [
      { paths: [file, folder, join(folder, 'child.txt'), file], worktreeId: 'folder:fixture' }
    ])
    expect(result).toEqual({ outcome: 'copied' })
    expect(nativeRequests.filter((frame) => frame.channel === 'file-drag-start')).toMatchObject([
      {
        args: [
          {
            paths: [await realpath(file), await realpath(folder)],
            sourcePaths: [file, folder],
            worktreeId: 'folder:fixture'
          }
        ]
      }
    ])
    expect(await readFile(file, 'utf8')).toBe('original')
    expect(await readFile(join(folder, 'child.txt'), 'utf8')).toBe('nested')
  })

  it('rejects unauthorized, missing, malformed and oversized drag requests before invoking AppKit', async () => {
    const { call, directory, project, nativeRequests } = scope()
    if (process.platform !== 'darwin') {
      return
    }
    await call('repos:add', [{ path: project, kind: 'folder' }])
    const outside = join(directory, 'private.txt')
    await writeFile(outside, 'private')
    for (const paths of [
      [outside],
      [join(project, 'missing')],
      [],
      ['relative.txt'],
      [123],
      ['/tmp/a\0b'],
      Array(257).fill('/tmp/a'),
      [`/${'x'.repeat(262144)}`]
    ]) {
      await expect(
        call('ui:startFileDrag', [{ paths, worktreeId: 'folder:fixture' }])
      ).rejects.toThrow()
    }
    expect(nativeRequests.filter((frame) => frame.channel === 'file-drag-start')).toEqual([])
  })
}
