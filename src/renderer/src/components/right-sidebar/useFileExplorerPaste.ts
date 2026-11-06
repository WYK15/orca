import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { importExternalPathsToRuntime } from '@/runtime/runtime-file-client'
import { translate } from '@/i18n/i18n'
import { isPathInsideOrEqual } from '../../../../shared/cross-platform-path'
import type { FileExplorerOperationOwner } from './file-explorer-types'
import { captureFileExplorerOperationGuard } from './file-explorer-operation-owner'

export type FileExplorerPasteOptions = {
  worktreePath: string | null
  activeWorktreeId: string | null
  operationOwner?: FileExplorerOperationOwner
  enabled: boolean
  refreshDir: (path: string) => Promise<void>
  setSelectedPath: (path: string | null) => void
}

export function useFileExplorerPaste(options: FileExplorerPasteOptions) {
  const current = useRef(options)
  current.current = options
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [busy, setBusy] = useState(false)
  const available = typeof window.api?.ui?.readClipboardFiles === 'function'
  const paste = useCallback(
    async (destinationDir: string, owner?: FileExplorerOperationOwner): Promise<void> => {
      const read = window.api?.ui?.readClipboardFiles
      const captured = current.current
      if (
        !read ||
        !captured.enabled ||
        pending.current ||
        !captured.worktreePath ||
        !captured.activeWorktreeId ||
        !isPathInsideOrEqual(captured.worktreePath, destinationDir)
      ) {
        return
      }
      pending.current = true
      setBusy(true)
      const isCurrent = (): boolean =>
        mounted.current &&
        current.current.enabled &&
        captured.activeWorktreeId === current.current.activeWorktreeId &&
        captured.worktreePath === current.current.worktreePath
      let progress: string | number | undefined
      const progressTimer = window.setTimeout(() => {
        if (isCurrent()) {
          progress = toast.loading(translate('fileExplorerClipboard.pasting', 'Pasting files…'))
        }
      }, 1000)
      try {
        const guard = captureFileExplorerOperationGuard(
          captured.activeWorktreeId,
          owner ?? captured.operationOwner
        )
        const paths = await read()
        if (!isCurrent()) {
          return
        }
        guard.assertCurrent()
        if (!paths.length) {
          toast.info(translate('fileExplorerClipboard.empty', 'The clipboard contains no files.'))
          return
        }
        const { results } = await importExternalPathsToRuntime(
          {
            ...guard.route,
            worktreeId: captured.activeWorktreeId,
            worktreePath: captured.worktreePath
          },
          paths,
          destinationDir,
          {
            assertCurrent: () => {
              if (!isCurrent()) {
                throw new Error('The active workspace changed')
              }
              guard.assertCurrent()
            }
          }
        )
        if (!isCurrent()) {
          return
        }
        guard.assertCurrent()
        await captured.refreshDir(destinationDir)
        if (!isCurrent()) {
          return
        }
        guard.assertCurrent()
        const imported = results.find((result) => result.status === 'imported')
        if (imported?.status === 'imported') {
          captured.setSelectedPath(imported.destPath)
        }
        const failed = results.filter((result) => result.status === 'failed')
        const skipped = results.filter((result) => result.status === 'skipped')
        if (failed.length) {
          toast.error(
            translate('fileExplorerClipboard.failed', 'Could not paste {{count}} item(s).', {
              count: failed.length
            })
          )
        } else if (skipped.length) {
          toast.info(
            translate('fileExplorerClipboard.skipped', '{{count}} item(s) were skipped.', {
              count: skipped.length
            })
          )
        }
      } catch (error) {
        if (isCurrent()) {
          toast.error(
            extractIpcErrorMessage(
              error,
              translate('fileExplorerClipboard.error', 'Could not paste files.')
            )
          )
        }
      } finally {
        clearTimeout(progressTimer)
        if (progress !== undefined) {
          toast.dismiss(progress)
        }
        pending.current = false
        if (mounted.current) {
          setBusy(false)
        }
      }
    },
    []
  )
  return { paste, busy, available }
}
