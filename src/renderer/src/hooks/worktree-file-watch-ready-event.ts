export const WORKTREE_FILE_WATCH_READY_EVENT = 'orca:worktree-file-watch-ready'

export type WorktreeFileWatchReadyDetail = {
  worktreeId: string
  worktreePath: string
  connectionId?: string
  runtimeEnvironmentId: string | null
}
