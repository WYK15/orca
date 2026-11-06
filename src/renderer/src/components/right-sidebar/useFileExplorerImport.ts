import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { importExternalPathsToRuntime } from '@/runtime/runtime-file-client'
import { translate } from '@/i18n/i18n'
import { isPathInsideOrEqual } from '../../../../shared/cross-platform-path'
import type { FileExplorerOperationOwner } from './file-explorer-types'
import { captureFileExplorerOperationGuard } from './file-explorer-operation-owner'

type UseFileExplorerImportParams = {
  worktreePath: string | null
  activeWorktreeId: string | null
  refreshDir: (dirPath: string) => Promise<void>
  clearNativeDragState: () => void
  setSelectedPath: (path: string | null) => void
  operationOwner?: FileExplorerOperationOwner
}

/**
 * Subscribes to native file-drop events targeted at the file explorer and
 * runs the import pipeline: copy into worktree, refresh, reveal.
 *
 * Why this is a separate hook: the actual filesystem paths from native OS
 * drops are only available through the preload-relayed IPC event, not the
 * React drop handler. The drop handler manages visual state; this hook
 * manages the import action.
 */
export function useFileExplorerImport(options: UseFileExplorerImportParams): void {
  const current = useRef(options)
  current.current = options

  useEffect(() => {
    let disposed = false
    const unsubscribe = window.api.ui.onFileDrop((data) => {
      if (data.target !== 'file-explorer') {
        return
      }

      const captured = current.current
      const { activeWorktreeId: wtId, worktreePath } = captured
      const { paths, destinationDir } = data
      if (!wtId || !worktreePath || !isPathInsideOrEqual(worktreePath, destinationDir)) {
        captured.clearNativeDragState()
        return
      }

      const isCurrent = (): boolean =>
        !disposed &&
        current.current.activeWorktreeId === wtId &&
        current.current.worktreePath === worktreePath

      void (async () => {
        try {
          const operationGuard = captureFileExplorerOperationGuard(wtId, captured.operationOwner)
          const assertCurrent = (): void => {
            if (!isCurrent()) {
              throw new Error('The active workspace changed')
            }
            operationGuard.assertCurrent()
          }
          assertCurrent()
          const { results } = await importExternalPathsToRuntime(
            {
              settings: operationGuard.route.settings,
              worktreeId: wtId,
              worktreePath,
              connectionId: operationGuard.route.connectionId,
              expectedExecutionHostId: operationGuard.route.expectedExecutionHostId,
              expectedSshTargetId: operationGuard.route.expectedSshTargetId,
              expectedSshConnectionGeneration: operationGuard.route.expectedSshConnectionGeneration
            },
            paths,
            destinationDir,
            { assertCurrent }
          )

          if (!isCurrent()) {
            return
          }
          assertCurrent()
          // Refresh the destination directory once per gesture
          await captured.refreshDir(destinationDir)
          if (!isCurrent()) {
            return
          }
          assertCurrent()

          // Why: only select (highlight) the first imported file — don't trigger
          // the full reveal machinery because watcher refreshes can otherwise
          // snap the tree viewport away from the user's drop target.
          const imported = results.filter((r) => r.status === 'imported')
          const skipped = results.filter((r) => r.status === 'skipped')
          const failed = results.filter((r) => r.status === 'failed')

          if (imported.length > 0) {
            captured.setSelectedPath(imported[0].destPath)
          }

          if (failed.length > 0) {
            const noun = failed.length === 1 ? 'file' : 'files'
            toast.error(
              translate(
                'auto.components.right.sidebar.useFileExplorerImport.132fd0e1e9',
                'Failed to import {{value0}} {{value1}}.',
                { value0: failed.length, value1: noun }
              )
            )
          } else if (skipped.length > 0 && imported.length === 0) {
            const noun = skipped.length === 1 ? 'file' : 'files'
            toast.error(
              translate(
                'auto.components.right.sidebar.useFileExplorerImport.25919b2050',
                'Skipped {{value0}} {{value1}}.',
                { value0: skipped.length, value1: noun }
              )
            )
          }
        } catch (err) {
          if (isCurrent()) {
            toast.error(extractIpcErrorMessage(err, 'Failed to import files.'))
          }
        } finally {
          if (isCurrent()) {
            captured.clearNativeDragState()
          }
        }
      })()
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])
}
