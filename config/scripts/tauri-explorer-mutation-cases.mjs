import { expect, it } from 'vitest'
import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

export function registerTauriExplorerMutationTests(scope) {
  it.each(['folder', 'git'])(
    'runs create, duplicate, rename, move and search in a %s project',
    async (kind) => {
      const { call, project, execute, nativeResponses, nativeRequests } = scope()
      const root = await realpath(project)
      if (kind === 'git') {
        await execute('git', ['init', '-q', root])
      }
      await call('repos:add', [{ path: root, kind }])
      const directory = join(root, '中文 资料')
      const destination = join(root, 'destination')
      await call('fs:createDir', [{ dirPath: directory }])
      await call('fs:createDir', [{ dirPath: destination }])
      const file = join(directory, 'note.md')
      await call('fs:createFile', [{ filePath: file }])
      const content = '# 原文\nHOST host\narrow -> value\n'
      await call('fs:writeFile', [{ filePath: file, content }])
      await expect(call('fs:createFile', [{ filePath: file }])).rejects.toThrow()
      await expect(call('fs:createDir', [{ dirPath: directory }])).rejects.toThrow()
      expect(await readFile(file, 'utf8')).toBe(content)

      const copy = join(directory, 'note copy.md')
      await call('fs:copy', [{ sourcePath: file, destinationPath: copy }])
      await expect(call('fs:copy', [{ sourcePath: file, destinationPath: copy }])).rejects.toThrow()
      await expect(call('fs:rename', [{ oldPath: file, newPath: copy }])).rejects.toThrow()
      expect(await readFile(file, 'utf8')).toBe(content)
      expect(await readFile(copy, 'utf8')).toBe(content)

      const renamed = join(directory, 'renamed.md')
      await call('fs:rename', [{ oldPath: file, newPath: renamed }])
      const moved = join(destination, 'renamed.md')
      await call('fs:rename', [{ oldPath: renamed, newPath: moved }])
      expect(await call('fs:readDir', [{ dirPath: directory }])).toEqual([
        expect.objectContaining({ name: 'note copy.md', isDirectory: false })
      ])
      expect(await readFile(moved, 'utf8')).toBe(content)
      const renamedDirectory = join(root, '目录 renamed')
      await call('fs:rename', [{ oldPath: directory, newPath: renamedDirectory }])
      expect(await readFile(join(renamedDirectory, 'note copy.md'), 'utf8')).toBe(content)

      const search = (filters) => call('fs:search', [{ rootPath: root, query: 'HOST', ...filters }])
      expect((await search()).totalMatches).toBe(4)
      expect((await search({ caseSensitive: true })).totalMatches).toBe(2)
      const filtered = await search({
        includePattern: 'destination/**',
        excludePattern: '**/*copy*'
      })
      expect(filtered.files.map((result) => result.relativePath)).toEqual([
        'destination/renamed.md'
      ])
      expect(
        (await search({ query: 'H.ST', useRegex: true, caseSensitive: true })).totalMatches
      ).toBe(2)

      nativeResponses.set('trash-path', null)
      await call('fs:deletePath', [{ targetPath: moved }])
      expect(nativeRequests.findLast((frame) => frame.channel === 'trash-path').args).toEqual([
        moved
      ])
      const outside = join(root, '..', 'outside.md')
      await expect(call('fs:createFile', [{ filePath: outside }])).rejects.toThrow('Access denied')
      await expect(call('fs:rename', [{ oldPath: copy, newPath: outside }])).rejects.toThrow(
        'Access denied'
      )
      const trashCalls = nativeRequests.filter((frame) => frame.channel === 'trash-path').length
      await expect(call('fs:deletePath', [{ targetPath: outside }])).rejects.toThrow(
        'Access denied'
      )
      expect(nativeRequests.filter((frame) => frame.channel === 'trash-path')).toHaveLength(
        trashCalls
      )
    }
  )
}
