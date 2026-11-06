// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { DetectedWorktreeListResult, Repo } from '../../../shared/types'
import { getEditorExternalWatchTargets } from './useEditorExternalWatch'

const initial = useAppStore.getState()
function detected(path = '/project'): DetectedWorktreeListResult {
  return {
    worktrees: [{ id: 'worktree', repoId: 'repo', path, hostId: 'local' }]
  } as DetectedWorktreeListResult
}
beforeEach(() => {
  useAppStore.setState({
    activeWorktreeId: 'worktree',
    activeWorkspaceExecutionHostId: 'local',
    repos: [{ id: 'repo', path: '/project', kind: 'git', executionHostId: 'local' } as Repo],
    worktreesByRepo: {},
    detectedWorktreesByRepo: { repo: detected() },
    folderWorkspaces: [],
    openFiles: [],
    rightSidebarOpen: true,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files'
  })
})
afterEach(() => useAppStore.setState(initial))

describe('restored detected worktree watches', () => {
  it('watches a visible worktree already resolvable by the explorer before the primary catalog arrives', () => {
    const state = useAppStore.getState()
    expect(state.getKnownWorktreeById('worktree', 'local')?.path).toBe('/project')
    expect(getEditorExternalWatchTargets(state).targets).toEqual([
      {
        worktreeId: 'worktree',
        worktreePath: '/project',
        connectionId: undefined,
        runtimeEnvironmentId: null
      }
    ])
  })

  it('recomputes cached watches when the detected catalog hydrates or changes', () => {
    useAppStore.setState({ detectedWorktreesByRepo: {} })
    expect(getEditorExternalWatchTargets(useAppStore.getState()).targets).toEqual([])
    useAppStore.setState({ detectedWorktreesByRepo: { repo: detected() } })
    expect(getEditorExternalWatchTargets(useAppStore.getState()).targets[0]?.worktreePath).toBe(
      '/project'
    )
    useAppStore.setState({ detectedWorktreesByRepo: { repo: detected('/moved') } })
    expect(getEditorExternalWatchTargets(useAppStore.getState()).targets[0]?.worktreePath).toBe(
      '/moved'
    )
  })

  it('also watches detected worktrees consumed by Source Control', () => {
    useAppStore.setState({ rightSidebarTab: 'source-control' })
    expect(getEditorExternalWatchTargets(useAppStore.getState()).targets).toHaveLength(1)
  })

  it("does not fall back to another host's worktree with the same id", () => {
    useAppStore.setState({
      activeWorkspaceExecutionHostId: 'ssh:server',
      worktreesByRepo: { repo: [{ ...detected().worktrees[0] }] as never }
    })
    expect(getEditorExternalWatchTargets(useAppStore.getState()).targets).toEqual([])
  })
})
