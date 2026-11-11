import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Store } from '../main/persistence'
import { resolveAuthorizedPath } from '../main/ipc/filesystem-auth'
import { pruneFileDragPaths } from '../shared/file-drag'
import { validateNativeFileDropPaths } from '../shared/native-file-drop'
import { nativeCall } from './desktop-context'
import { ipcMain } from './ipc-port'

export function registerFileDragHandlers(store: Store): void {
  ipcMain.handle('ui:startFileDrag', async (_event, value: unknown) => {
    if (process.platform !== 'darwin') {
      throw new Error('Native file dragging requires macOS')
    }
    const request = value as { paths?: unknown; worktreeId?: unknown } | null
    if (
      !request ||
      typeof request.worktreeId !== 'string' ||
      !request.worktreeId ||
      request.worktreeId.length > 4096 ||
      !Array.isArray(request.paths) ||
      request.paths.length === 0 ||
      !request.paths.every(
        (path) => typeof path === 'string' && isAbsolute(path) && !path.includes('\0')
      ) ||
      validateNativeFileDropPaths(request.paths).status !== 'accepted'
    ) {
      throw new Error('Invalid native file drag request')
    }
    const sourcePaths = pruneFileDragPaths(request.paths)
    const paths = await Promise.all(
      sourcePaths.map(async (path) => {
        const authorized = await resolveAuthorizedPath(path, store, { preserveSymlink: true })
        const info = await lstat(authorized)
        if (!info.isFile() && !info.isDirectory() && !info.isSymbolicLink()) {
          throw new Error('Only files and folders can be dragged')
        }
        return authorized
      })
    )
    return nativeCall('file-drag-start', { paths, sourcePaths, worktreeId: request.worktreeId })
  })
}
