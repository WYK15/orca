import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SidebarProjectEntry } from '../../../../shared/sidebar-project-archive'
import type { GlobalSettings, Worktree } from '../../../../shared/types'

const mocks = vi.hoisted(() => ({
  state: {
    settings: {} as Partial<GlobalSettings>,
    worktreesByRepo: {} as Record<string, Worktree[]>,
    updateSettingsOrThrow: vi.fn(),
    fetchWorktrees: vi.fn(),
    setActiveWorktree: vi.fn()
  },
  toast: Object.assign(vi.fn(), { error: vi.fn() })
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import {
  openSidebarProject,
  setSidebarProjectsArchived,
  toggleSidebarProjectPin
} from './sidebar-project-archive-actions'

const entry = (id: string): SidebarProjectEntry => ({
  id,
  name: id,
  repoIds: [id],
  repos: [{ id, displayName: id, path: `/work/${id}`, badgeColor: '', addedAt: 1 }],
  archivedAt: null,
  pinned: false
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.settings = {}
  mocks.state.worktreesByRepo = {}
  mocks.state.updateSettingsOrThrow.mockImplementation(async (updates: Partial<GlobalSettings>) => {
    mocks.state.settings = { ...mocks.state.settings, ...updates }
  })
})

describe('project organization persistence', () => {
  it('serializes overlapping operations using the latest saved settings', async () => {
    let finishFirst!: () => void
    const firstSave = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    mocks.state.updateSettingsOrThrow.mockImplementationOnce(async (updates) => {
      await firstSave
      mocks.state.settings = { ...mocks.state.settings, ...updates }
    })
    const first = setSidebarProjectsArchived([entry('a')], true)
    const second = setSidebarProjectsArchived([entry('b')], true)
    await vi.waitFor(() => expect(mocks.state.updateSettingsOrThrow).toHaveBeenCalledTimes(1))
    finishFirst()
    expect(await Promise.all([first, second])).toEqual([true, true])
    expect(Object.keys(mocks.state.settings.sidebarProjectArchive!)).toEqual(['a', 'b'])
  })

  it('keeps failed saves unchanged and permits the next operation', async () => {
    mocks.state.updateSettingsOrThrow.mockRejectedValueOnce(new Error('disk full'))
    expect(await setSidebarProjectsArchived([entry('a')], true)).toBe(false)
    expect(mocks.state.settings.sidebarProjectArchive).toBeUndefined()
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledOnce()
    expect(await setSidebarProjectsArchived([entry('b')], true)).toBe(true)
    expect(Object.keys(mocks.state.settings.sidebarProjectArchive!)).toEqual(['b'])
  })

  it('undoes only the affected project while preserving later organization changes', async () => {
    await setSidebarProjectsArchived([entry('a')], true)
    const undo = mocks.toast.mock.calls[0][1].action.onClick
    await setSidebarProjectsArchived([entry('b')], true)
    undo()
    await vi.waitFor(() => expect(mocks.state.settings.sidebarProjectArchive?.a).toBeUndefined())
    expect(mocks.state.settings.sidebarProjectArchive?.b).toBeTypeOf('number')
  })

  it('toggles pins from fresh state even when the rendered project entry is stale', async () => {
    const project = entry('a')
    await Promise.all([toggleSidebarProjectPin(project), toggleSidebarProjectPin(project)])
    expect(mocks.state.settings.sidebarPinnedRepoIds).toEqual([])
  })
})

describe('opening archived projects', () => {
  it('opens an SSH folder on its host without changing archive state or fetching local paths', async () => {
    const project = entry('remote')
    project.repos[0] = { ...project.repos[0], kind: 'folder', connectionId: 'server' }
    mocks.state.settings = { sidebarProjectArchive: { remote: 100 } }
    mocks.state.worktreesByRepo.remote = [
      {
        id: 'folder:remote',
        repoId: 'remote',
        path: '/work/remote'
      } as Worktree
    ]
    expect(await openSidebarProject(project)).toBe(true)
    expect(mocks.state.setActiveWorktree).toHaveBeenCalledWith('folder:remote', 'ssh:server')
    expect(mocks.state.updateSettingsOrThrow).not.toHaveBeenCalled()
    expect(mocks.state.fetchWorktrees).not.toHaveBeenCalled()
  })

  it('keeps an unavailable project archived and reports the failure', async () => {
    mocks.state.fetchWorktrees.mockRejectedValueOnce(new Error('SSH host unavailable'))
    mocks.state.settings = { sidebarProjectArchive: { remote: 100 } }
    expect(await openSidebarProject(entry('remote'))).toBe(false)
    expect(mocks.state.settings.sidebarProjectArchive).toEqual({ remote: 100 })
    expect(mocks.state.setActiveWorktree).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledOnce()
  })
})
