import { expect, it } from 'vitest'
import { realpath, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export function registerTauriFilesystemWatchTests(scope) {
  it('reports external file creation, rename and deletion in an ordinary folder', async () => {
    const { call, project, execute, events, diagnostics } = scope()
    const root = await realpath(project)
    await call('repos:add', [{ path: root, kind: 'folder' }])
    const nested = join(root, 'nested')
    await mkdir(nested)
    await call('fs:watchWorktree', [{ worktreePath: root }])
    const changes = () =>
      events()
        .filter((frame) => frame.channel === 'fs:changed')
        .flatMap((frame) => frame.args[0].events)
    const expectChange = async (absolutePath, kind) => {
      await expect
        .poll(() => changes(), { timeout: 10_000, message: diagnostics() })
        .toContainEqual(expect.objectContaining({ absolutePath, kind }))
    }
    const run = (script, ...paths) => execute(process.execPath, ['-e', script, ...paths])
    try {
      for (const parent of [root, nested]) {
        const file = join(parent, '新建 文件.txt')
        const renamed = join(parent, 'renamed.txt')
        await run(
          "require('node:fs').closeSync(require('node:fs').openSync(process.argv[1], 'w'))",
          file
        )
        await expectChange(file, 'create')
        expect(await call('fs:readDir', [{ dirPath: parent }])).toContainEqual(
          expect.objectContaining({ name: '新建 文件.txt', isDirectory: false })
        )
        await run("require('node:fs').renameSync(process.argv[1], process.argv[2])", file, renamed)
        await expectChange(file, 'delete')
        await expectChange(renamed, 'create')
        await run("require('node:fs').unlinkSync(process.argv[1])", renamed)
        await expectChange(renamed, 'delete')
        expect(await call('fs:readDir', [{ dirPath: parent }])).not.toContainEqual(
          expect.objectContaining({ name: 'renamed.txt' })
        )
      }
    } finally {
      await call('fs:unwatchWorktree', [{ worktreePath: root }])
    }
  })
}
