import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { Worktree } from '../../../../shared/worktree/types'

export function setWorktreeHiddenInOrca(
  worktree: Worktree,
  hidden: boolean
): Promise<{ ok: boolean; error?: string }> {
  return useAppStore.getState().updateWorktreeMeta(
    worktree.id,
    { isArchived: hidden },
    {
      executionHostId: worktree.hostId ?? 'local',
      shouldApply: (current) => current?.instanceId === worktree.instanceId
    }
  )
}

async function undoHiddenWorktree(worktree: Worktree): Promise<void> {
  const result = await setWorktreeHiddenInOrca(worktree, false)
  if (!result.ok) {
    toast.error(
      translate(
        'auto.components.sidebar.worktreeHiddenState.showFailed',
        'Could not show this worktree'
      ),
      { description: result.error }
    )
  }
}

export async function hideWorktreeFromOrca(worktree: Worktree): Promise<void> {
  const result = await setWorktreeHiddenInOrca(worktree, true)
  if (!result.ok) {
    toast.error(
      translate(
        'auto.components.sidebar.worktreeHiddenState.hideFailed',
        'Could not hide this worktree'
      ),
      { description: result.error }
    )
    return
  }

  const state = useAppStore.getState()
  const targetHostId = worktree.hostId ?? null
  if (
    state.activeWorktreeId === worktree.id &&
    (state.activeWorkspaceExecutionHostId ?? null) === targetHostId
  ) {
    const mainWorktree = (state.worktreesByRepo[worktree.repoId] ?? []).find(
      (candidate) =>
        candidate.isMainWorktree &&
        !candidate.isArchived &&
        (candidate.hostId ?? null) === targetHostId
    )
    if (mainWorktree) {
      const activationOptions: NonNullable<Parameters<typeof activateAndRevealWorktree>[1]> = {
        revealInSidebar: true
      }
      if (mainWorktree.hostId) {
        activationOptions.executionHostId = mainWorktree.hostId
      }
      activateAndRevealWorktree(mainWorktree.id, activationOptions)
    }
  }

  toast.success(
    translate('auto.components.sidebar.worktreeHiddenState.hidden', 'Worktree hidden from Orca'),
    {
      description: translate(
        'auto.components.sidebar.worktreeHiddenState.hiddenDescription',
        'Its files, Git worktree, branch, and running processes were not deleted.'
      ),
      action: {
        label: translate('auto.components.sidebar.worktreeHiddenState.undo', 'Undo'),
        onClick: () => void undoHiddenWorktree(worktree)
      }
    }
  )
}
