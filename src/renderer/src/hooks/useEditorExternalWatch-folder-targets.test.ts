import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import {
  getEditorExternalWatchTargets,
  type EditorExternalWatchTargetState
} from './useEditorExternalWatch'

vi.mock('@/store', () => ({ useAppStore: { getState: vi.fn() } }))
vi.mock('@/components/editor/editor-autosave', () => ({
  notifyEditorExternalFileChange: vi.fn(),
  getOpenFilesForExternalFileChange: vi.fn(() => [])
}))

type FolderState = EditorExternalWatchTargetState &
  Pick<AppState, 'folderWorkspaces' | 'projectGroups' | 'activeWorkspaceExecutionHostId'>

function state(): FolderState {
  return {
    openFiles: [],
    worktreesByRepo: {},
    repos: [],
    activeWorktreeId: 'folder:notes',
    settings: null,
    rightSidebarOpen: true,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    gitStatusHugeByWorktree: {},
    sshConnectionStates: new Map(),
    projectGroups: [],
    activeWorkspaceExecutionHostId: 'local',
    folderWorkspaces: [
      {
        id: 'notes',
        projectGroupId: 'group',
        name: 'Notes',
        folderPath: '/project',
        executionHostId: 'local'
      } as AppState['folderWorkspaces'][number]
    ]
  }
}

describe('folder workspace filesystem watch targets', () => {
  it('watches the visible folder even with no editor tabs or Git worktrees', () => {
    expect(getEditorExternalWatchTargets(state()).targets).toEqual([
      {
        worktreeId: 'folder:notes',
        worktreePath: '/project',
        connectionId: undefined,
        runtimeEnvironmentId: null
      }
    ])
  })

  it('keeps an open folder editor watched after hiding the sidebar', () => {
    const next = state()
    next.rightSidebarOpen = false
    next.openFiles = [{ worktreeId: 'folder:notes' } as AppState['openFiles'][number]]
    expect(getEditorExternalWatchTargets(next).targets).toHaveLength(1)
  })

  it('invalidates the cached target when folder catalogs hydrate, move or disappear', () => {
    const next = state()
    const folders = next.folderWorkspaces
    next.folderWorkspaces = []
    expect(getEditorExternalWatchTargets(next).targets).toEqual([])
    next.folderWorkspaces = folders
    expect(getEditorExternalWatchTargets(next).targets[0]?.worktreePath).toBe('/project')
    next.folderWorkspaces = [{ ...folders[0], folderPath: '/moved' }]
    expect(getEditorExternalWatchTargets(next).targets[0]?.worktreePath).toBe('/moved')
    next.folderWorkspaces = []
    expect(getEditorExternalWatchTargets(next).targets).toEqual([])
  })

  it.each([
    ['ssh:server', 'server', null],
    ['runtime:server', undefined, 'server']
  ] as const)(
    'keeps the %s owner rather than watching a matching local path',
    (host, connectionId, runtimeEnvironmentId) => {
      const next = state()
      next.activeWorkspaceExecutionHostId = host
      next.folderWorkspaces = [{ ...next.folderWorkspaces[0], executionHostId: host }]
      expect(getEditorExternalWatchTargets(next).targets).toEqual([
        {
          worktreeId: 'folder:notes',
          worktreePath: '/project',
          connectionId,
          runtimeEnvironmentId
        }
      ])
    }
  )

  it('does not watch a folder without an editor when its file tree is hidden', () => {
    const next = state()
    next.rightSidebarOpen = false
    expect(getEditorExternalWatchTargets(next).targets).toEqual([])
    next.rightSidebarOpen = true
    next.rightSidebarExplorerView = 'search'
    expect(getEditorExternalWatchTargets(next).targets).toEqual([])
  })

  it("updates the selected host without reusing another host's folder path", () => {
    const next = state()
    next.folderWorkspaces = [
      ...next.folderWorkspaces,
      { ...next.folderWorkspaces[0], folderPath: '/remote', executionHostId: 'ssh:server' }
    ]
    expect(getEditorExternalWatchTargets(next).targets[0]?.worktreePath).toBe('/project')
    next.activeWorkspaceExecutionHostId = 'ssh:server'
    expect(getEditorExternalWatchTargets(next).targets[0]).toMatchObject({
      worktreePath: '/remote',
      connectionId: 'server'
    })
    next.activeWorkspaceExecutionHostId = null
    expect(getEditorExternalWatchTargets(next).targets).toEqual([])
  })

  it('updates inherited SSH ownership when the project group changes', () => {
    const next = state()
    next.activeWorkspaceExecutionHostId = null
    next.folderWorkspaces = [{ ...next.folderWorkspaces[0], executionHostId: undefined }]
    next.projectGroups = [
      { id: 'group', connectionId: 'server' } as AppState['projectGroups'][number]
    ]
    expect(getEditorExternalWatchTargets(next).targets[0]?.connectionId).toBe('server')
    next.projectGroups = [{ ...next.projectGroups[0], connectionId: null }]
    expect(getEditorExternalWatchTargets(next).targets[0]?.connectionId).toBeUndefined()
    expect(getEditorExternalWatchTargets(next).targets).toHaveLength(1)
  })
})
