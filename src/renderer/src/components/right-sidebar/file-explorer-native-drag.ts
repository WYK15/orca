import type { DragEvent } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { captureFileExplorerOperationGuard } from './file-explorer-operation-owner'
import type { FileExplorerOperationOwner } from './file-explorer-types'

/** Cancel WebKit's text drag before starting an OS file drag. */
export function startFileExplorerNativeDrag(
  event: DragEvent,
  paths: string[],
  worktreeId: string | null,
  owner: FileExplorerOperationOwner | undefined,
  onDragSourceChange: (path: string | null) => void
): boolean {
  const start = window.api.ui.startFileDrag
  if (!start || !worktreeId || owner?.kind !== 'local') {
    return false
  }
  event.preventDefault()
  const finish = (): void => {
    if (useAppStore.getState().activeWorktreeId === worktreeId) {
      onDragSourceChange(null)
    }
    document.dispatchEvent(new Event('dragend', { bubbles: true }))
  }
  try {
    captureFileExplorerOperationGuard(worktreeId, owner).assertCurrent()
    onDragSourceChange(paths[0])
    void start({ paths, worktreeId })
      .catch((error) => toast.error(extractIpcErrorMessage(error, 'Failed to drag files.')))
      .finally(finish)
  } catch (error) {
    finish()
    toast.error(extractIpcErrorMessage(error, 'Failed to drag files.'))
  }
  return true
}
