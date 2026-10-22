import type { GlobalSettings, Project, Repo } from './types'

export type SidebarProjectArchive = Record<string, number>
export type SidebarProjectEntry = {
  id: string
  name: string
  repoIds: string[]
  repos: Repo[]
  archivedAt: number | null
  pinned: boolean
}

export function normalizeSidebarProjectArchive(value: unknown): SidebarProjectArchive {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, time]) => id.length > 0 && typeof time === 'number' && Number.isFinite(time) && time > 0
    )
  )
}

export function buildSidebarProjectCatalog(
  repos: readonly Repo[],
  projects: readonly Project[],
  settings: Pick<GlobalSettings, 'sidebarProjectArchive' | 'sidebarPinnedRepoIds'> | null
): SidebarProjectEntry[] {
  const archive = normalizeSidebarProjectArchive(settings?.sidebarProjectArchive)
  const pinned = new Set(settings?.sidebarPinnedRepoIds ?? [])
  const repoMap = new Map(repos.map((repo) => [repo.id, repo]))
  const claimed = new Set<string>()
  const entries: SidebarProjectEntry[] = []
  const add = (id: string, name: string, sourceRepoIds: readonly string[]) => {
    const members = sourceRepoIds.flatMap((repoId) => {
      const repo = repoMap.get(repoId)
      if (!repo || claimed.has(repoId)) {
        return []
      }
      claimed.add(repoId)
      return [repo]
    })
    if (!members.length) {
      return
    }
    const repoIds = members.map((repo) => repo.id)
    const archivedTimes = repoIds.flatMap((repoId) => (archive[repoId] ? [archive[repoId]] : []))
    entries.push({
      id,
      name,
      repoIds,
      repos: members,
      archivedAt: archivedTimes.length ? Math.max(...archivedTimes) : null,
      pinned: repoIds.some((repoId) => pinned.has(repoId))
    })
  }
  for (const project of projects) {
    add(project.id, project.displayName, project.sourceRepoIds)
  }
  for (const repo of repos) {
    add(`repo:${repo.id}`, repo.displayName, [repo.id])
  }
  return entries
}

export function getArchivedSidebarRepoIds(
  repos: readonly Repo[],
  projects: readonly Project[],
  settings: Pick<GlobalSettings, 'sidebarProjectArchive'> | null
): Set<string> {
  return new Set(
    buildSidebarProjectCatalog(repos, projects, settings).flatMap((entry) =>
      entry.archivedAt === null ? [] : entry.repoIds
    )
  )
}

export function updateSidebarProjectArchive(
  archive: unknown,
  repoIds: readonly string[],
  archivedAt: number | null
): SidebarProjectArchive {
  const next = normalizeSidebarProjectArchive(archive)
  for (const id of new Set(repoIds)) {
    if (archivedAt === null) {
      delete next[id]
    } else if (Number.isFinite(archivedAt) && archivedAt > 0) {
      Object.defineProperty(next, id, {
        value: archivedAt,
        enumerable: true,
        writable: true,
        configurable: true
      })
    }
  }
  return next
}

export function orderSidebarPinnedRepos(
  repos: readonly Repo[],
  pinnedRepoIds: readonly string[] | undefined
): Repo[] {
  const pinned = new Set(pinnedRepoIds ?? [])
  return [
    ...repos.filter((repo) => pinned.has(repo.id)),
    ...repos.filter((repo) => !pinned.has(repo.id))
  ]
}
