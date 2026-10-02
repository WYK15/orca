import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'
import type { NewExternalWorktreesInboxActionState } from './new-external-worktrees-inbox-actions'
import { setWorktreeHiddenInOrca } from './worktree-hidden-state-actions'

export function useArchivedWorktreeRecovery(
  setActionState: (state: NewExternalWorktreesInboxActionState | null) => void,
  scope = ''
): {
  busyArchivedWorktreeId: string | null
  showArchivedWorktree: (worktree: Worktree) => Promise<void>
} {
  const [busy, setBusy] = useState<{ scope: string; id: string } | null>(null)
  const currentScopeRef = useRef<string | null>(scope)
  useLayoutEffect(() => {
    currentScopeRef.current = scope
    return () => {
      currentScopeRef.current = null
    }
  }, [scope])
  const showArchivedWorktree = useCallback(
    async (worktree: Worktree) => {
      setActionState(null)
      setBusy({ scope, id: worktree.id })
      try {
        const result = await setWorktreeHiddenInOrca(worktree, false)
        if (currentScopeRef.current === scope && !result.ok) {
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
        if (currentScopeRef.current === scope) {
          setBusy(null)
        }
      }
    },
    [scope, setActionState]
  )
  return { busyArchivedWorktreeId: busy?.scope === scope ? busy.id : null, showArchivedWorktree }
}
