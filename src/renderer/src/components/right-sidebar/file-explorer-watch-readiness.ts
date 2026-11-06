import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import {
  WORKTREE_FILE_WATCH_READY_EVENT,
  type WorktreeFileWatchReadyDetail
} from '@/hooks/worktree-file-watch-ready-event'
import { getFileExplorerOperationOwner } from './file-explorer-operation-owner'

export function subscribeFileExplorerWatchReadiness({
  worktreeId,
  worktreePath,
  runtimeEnvironmentId,
  onReady
}: {
  worktreeId: string
  worktreePath: string
  runtimeEnvironmentId: string | null
  onReady: () => void
}): () => void {
  const handleReady = (event: Event): void => {
    const target = (event as CustomEvent<WorktreeFileWatchReadyDetail>).detail
    if (
      !target ||
      target.worktreeId !== worktreeId ||
      target.runtimeEnvironmentId !== runtimeEnvironmentId ||
      normalizeRuntimePathForComparison(target.worktreePath) !==
        normalizeRuntimePathForComparison(worktreePath)
    ) {
      return
    }
    const owner = getFileExplorerOperationOwner(worktreeId)
    if (
      (owner.kind === 'local' && !target.connectionId) ||
      (owner.kind === 'ssh' && owner.connectionId === target.connectionId)
    ) {
      onReady()
    }
  }
  window.addEventListener(WORKTREE_FILE_WATCH_READY_EVENT, handleReady)
  return () => window.removeEventListener(WORKTREE_FILE_WATCH_READY_EVENT, handleReady)
}
