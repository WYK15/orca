import { describe, expect, it } from 'vitest'
import { migrateSidebarProjectArchive } from './sidebar-project-archive-migration'
import type { PersistedState, Project, Repo } from './types'

const repo = (id: string, extra: Partial<Repo> = {}): Repo => ({
  id,
  displayName: id,
  path: `/projects/${id}`,
  badgeColor: '',
  addedAt: 1,
  ...extra
})
const state = (repos: Repo[], archive: Record<string, number> = {}): PersistedState =>
  ({
    repos,
    projects: [],
    projectGroups: [],
    settings: { sidebarProjectArchive: archive },
    ui: { collapsedGroups: ['repo:already-collapsed'] },
    workspaceSession: { untouched: true }
  }) as unknown as PersistedState

describe('legacy sidebar archives become ordinary project groups', () => {
  it('does nothing when no available projects are archived', () => {
    const original = state([repo('active')], { offline: 100 })
    expect(migrateSidebarProjectArchive(original, 'Archive')).toEqual({
      state: original,
      changed: false
    })
  })

  it('moves Git and folder projects into a collapsed group while preserving active projects and sessions', () => {
    const original = state([repo('git'), repo('folder', { kind: 'folder' }), repo('active')], {
      git: 100,
      folder: 200
    })
    const result = migrateSidebarProjectArchive(original, '归档')
    const [group] = result.state.projectGroups
    expect(result.changed).toBe(true)
    expect(group).toMatchObject({
      name: '归档',
      parentPath: null,
      parentGroupId: null,
      createdFrom: 'migration',
      isCollapsed: true,
      executionHostId: 'local'
    })
    expect(result.state.repos.slice(0, 2).map((item) => item.projectGroupId)).toEqual([
      group.id,
      group.id
    ])
    expect(result.state.repos.map((item) => item.path)).toEqual(
      original.repos.map((item) => item.path)
    )
    expect(result.state.repos[2]).toBe(original.repos[2])
    expect(result.state.workspaceSession).toBe(original.workspaceSession)
    expect(result.state.ui.collapsedGroups).toEqual([
      'repo:already-collapsed',
      `project-group:${group.id}`
    ])
    expect(result.state.settings.sidebarProjectArchive).toEqual({})
    expect(original.settings.sidebarProjectArchive).toEqual({ git: 100, folder: 200 })
    expect(original.repos[0].projectGroupId).toBeUndefined()
    expect(original.projectGroups).toEqual([])
  })

  it('retains the archive meaning across all setups of a logical project', () => {
    const original = state([repo('first'), repo('second')], { first: 100 })
    original.projects = [
      {
        id: 'logical',
        displayName: 'Logical',
        sourceRepoIds: ['first', 'second'],
        createdAt: 1,
        updatedAt: 1,
        badgeColor: ''
      } satisfies Project
    ]
    const migrated = migrateSidebarProjectArchive(original, 'Archive').state
    expect(migrated.repos[0].projectGroupId).toBe(migrated.repos[1].projectGroupId)
    expect(migrated.projects).toBe(original.projects)
  })

  it('keeps native, SSH and runtime groups on the hosts that own their projects', () => {
    const original = state(
      [
        repo('native'),
        repo('ssh', { connectionId: 'server' }),
        repo('runtime', { executionHostId: 'runtime:remote' })
      ],
      { native: 100, ssh: 100, runtime: 100 }
    )
    const migrated = migrateSidebarProjectArchive(original, 'Archive').state
    expect(migrated.projectGroups.map((group) => group.executionHostId)).toEqual([
      'local',
      'ssh:server',
      'runtime:remote'
    ])
    expect(new Set(migrated.repos.map((item) => item.projectGroupId)).size).toBe(3)
  })

  it('reuses a renamed migration group without collapsing it again when an offline project returns', () => {
    const original = state([repo('first')], { first: 100, offline: 100 })
    const first = migrateSidebarProjectArchive(original, 'Archive').state
    expect(first.settings.sidebarProjectArchive).toEqual({ offline: 100 })
    first.projectGroups[0] = { ...first.projectGroups[0], name: 'Old projects' }
    first.ui.collapsedGroups = []
    first.repos = [...first.repos, repo('offline')]
    const second = migrateSidebarProjectArchive(first, 'Archive').state
    expect(second.projectGroups).toHaveLength(1)
    expect(second.projectGroups[0].name).toBe('Old projects')
    expect(second.ui.collapsedGroups).toEqual([])
    expect(second.repos.map((item) => item.projectGroupOrder)).toEqual([0, 1])
    expect(second.settings.sidebarProjectArchive).toEqual({})
    expect(migrateSidebarProjectArchive(second, 'Archive')).toEqual({
      state: second,
      changed: false
    })
  })
})
