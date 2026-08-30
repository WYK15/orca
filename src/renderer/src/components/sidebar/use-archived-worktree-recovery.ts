import { useCallback, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'
import type { NewExternalWorktreesInboxActionState } from './new-external-worktrees-inbox-actions'
import { setWorktreeHiddenInOrca } from './worktree-hidden-state-actions'

export function useArchivedWorktreeRecovery(
  setActionState: (state: NewExternalWorktreesInboxActionState | null) => void
): {
  busyArchivedWorktreeId: string | null
  showArchivedWorktree: (worktree: Worktree) => Promise<void>
} {
  const [busyArchivedWorktreeId, setBusyArchivedWorktreeId] = useState<string | null>(null)
  const showArchivedWorktree = useCallback(
    async (worktree: Worktree) => {
      setActionState(null)
      setBusyArchivedWorktreeId(worktree.id)
      try {
        const result = await setWorktreeHiddenInOrca(worktree, false)
        if (!result.ok) {
          setActionState({
            pending: false,
            error:
              result.error ??
              translate(
                'auto.components.sidebar.WorktreeVisibilityDialog.showArchivedFailed',
                'Could not show this worktree.'
              )
          })
        }
      } finally {
        setBusyArchivedWorktreeId(null)
      }
    },
    [setActionState]
  )
  return { busyArchivedWorktreeId, showArchivedWorktree }
}
