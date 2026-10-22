import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getProjectHostSetupProjectionFromState } from '@/store/project-host-setup-selector'
import {
  buildSidebarProjectCatalog,
  normalizeSidebarProjectArchive,
  updateSidebarProjectArchive,
  type SidebarProjectEntry
} from '../../../../shared/sidebar-project-archive'
import {
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../../shared/execution-host'
import { translate } from '@/i18n/i18n'

let pendingUpdate = Promise.resolve()

function enqueueUpdate(operation: () => Promise<void>): Promise<boolean> {
  const task = pendingUpdate.then(operation)
  pendingUpdate = task.catch(() => {})
  return task.then(
    () => true,
    (error) => {
      toast.error(translate('fork.archive.saveFailed', 'Could not save project organization.'), {
        description: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  )
}

export function getCurrentSidebarProjectCatalog(): SidebarProjectEntry[] {
  const state = useAppStore.getState()
  return buildSidebarProjectCatalog(
    state.repos,
    getProjectHostSetupProjectionFromState(state).projects,
    state.settings
  )
}

export function setSidebarProjectsArchived(
  entries: readonly SidebarProjectEntry[],
  archived: boolean
): Promise<boolean> {
  const repoIds = [...new Set(entries.flatMap((entry) => entry.repoIds))]
  return enqueueUpdate(async () => {
    const state = useAppStore.getState()
    const previous = normalizeSidebarProjectArchive(state.settings?.sidebarProjectArchive)
    const next = updateSidebarProjectArchive(previous, repoIds, archived ? Date.now() : null)
    await state.updateSettingsOrThrow({ sidebarProjectArchive: next })
    toast(
      archived
        ? translate('fork.archive.archived', 'Archived {{count}} projects.', {
            count: entries.length
          })
        : translate('fork.archive.restored', 'Restored {{count}} projects.', {
            count: entries.length
          }),
      {
        action: {
          label: translate('fork.archive.undo', 'Undo'),
          onClick: () => {
            void enqueueUpdate(async () => {
              const current = useAppStore.getState()
              let restored = normalizeSidebarProjectArchive(current.settings?.sidebarProjectArchive)
              for (const id of repoIds) {
                restored = updateSidebarProjectArchive(restored, [id], previous[id] ?? null)
              }
              await current.updateSettingsOrThrow({ sidebarProjectArchive: restored })
            })
          }
        }
      }
    )
  })
}

export function toggleSidebarProjectPin(entry: SidebarProjectEntry): Promise<boolean> {
  return enqueueUpdate(async () => {
    const state = useAppStore.getState()
    const current = new Set(state.settings?.sidebarPinnedRepoIds ?? [])
    const pinned = entry.repoIds.some((id) => current.has(id))
    for (const id of entry.repoIds) {
      if (pinned) {
        current.delete(id)
      } else {
        current.add(id)
      }
    }
    await state.updateSettingsOrThrow({ sidebarPinnedRepoIds: [...current] })
  })
}

export async function openSidebarProject(entry: SidebarProjectEntry): Promise<boolean> {
  try {
    let state = useAppStore.getState()
    const focusedHost = getSettingsFocusedExecutionHostId(state.settings)
    const repo =
      entry.repos.find((candidate) => getRepoExecutionHostId(candidate) === focusedHost) ??
      entry.repos[0]
    if (!state.worktreesByRepo[repo.id]?.length) {
      await state.fetchWorktrees(repo.id)
      state = useAppStore.getState()
    }
    const worktrees = (state.worktreesByRepo[repo.id] ?? []).filter(
      (worktree) => !worktree.isArchived
    )
    const worktree = worktrees.find((candidate) => candidate.path === repo.path) ?? worktrees[0]
    if (!worktree) {
      throw new Error(
        translate(
          'fork.archive.workspaceUnavailable',
          'No available workspace. Restore the project or check its host connection.'
        )
      )
    }
    state.setActiveWorktree(worktree.id, getRepoExecutionHostId(repo))
    return true
  } catch (error) {
    toast.error(translate('fork.archive.openFailed', 'Could not open the project.'), {
      description: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}
