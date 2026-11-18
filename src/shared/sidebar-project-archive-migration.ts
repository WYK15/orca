import { getRepoExecutionHostId } from './execution-host'
import { createProjectGroup } from './project-groups'
import {
  getArchivedSidebarRepoIds,
  normalizeSidebarProjectArchive
} from './sidebar-project-archive'
import type { PersistedState } from './types'

export function migrateSidebarProjectArchive(
  state: PersistedState,
  groupName: string
): { state: PersistedState; changed: boolean } {
  const archive = normalizeSidebarProjectArchive(state.settings.sidebarProjectArchive)
  const archived = getArchivedSidebarRepoIds(state.repos, state.projects ?? [], state.settings)
  const members = state.repos.filter((repo) => archived.has(repo.id))
  if (!members.length) {
    return { state, changed: false }
  }
  const groups = [...(state.projectGroups ?? [])]
  const collapsed = new Set(state.ui.collapsedGroups ?? [])
  const destinations = new Map<string, string>()
  let order = groups.reduce((max, group) => Math.max(max, group.tabOrder), -1)
  for (const repo of members) {
    const hostId = getRepoExecutionHostId(repo)
    const id = `sidebar-archive:${hostId}`
    if (!destinations.has(hostId)) {
      // Stable IDs let later imports join the migrated group after a user renames it.
      if (!groups.some((group) => group.id === id)) {
        groups.push({
          ...createProjectGroup({ name: groupName, createdFrom: 'migration', tabOrder: ++order }),
          id,
          executionHostId: hostId,
          connectionId: repo.connectionId ?? null,
          isCollapsed: true
        })
        collapsed.add(`project-group:${id}`)
      }
      destinations.set(hostId, id)
    }
    delete archive[repo.id]
  }
  const nextOrder = new Map<string, number>()
  for (const repo of state.repos) {
    if (repo.projectGroupId && Number.isFinite(repo.projectGroupOrder)) {
      nextOrder.set(
        repo.projectGroupId,
        Math.max(nextOrder.get(repo.projectGroupId) ?? -1, repo.projectGroupOrder!)
      )
    }
  }
  return {
    changed: true,
    state: {
      ...state,
      repos: state.repos.map((repo) => {
        if (!archived.has(repo.id)) {
          return repo
        }
        const groupId = destinations.get(getRepoExecutionHostId(repo))!
        const rank = (nextOrder.get(groupId) ?? -1) + 1
        nextOrder.set(groupId, rank)
        return { ...repo, projectGroupId: groupId, projectGroupOrder: rank }
      }),
      projectGroups: groups,
      settings: { ...state.settings, sidebarProjectArchive: archive },
      ui: { ...state.ui, collapsedGroups: [...collapsed] }
    }
  }
}
