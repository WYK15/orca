import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDetectedResult } from './worktrees-detected-listing-fixtures'
import { makeTerminalTab, makeWorktree } from './worktrees-slice-test-fixtures'
import {
  createTestStore,
  mockApi,
  resetRemoteRuntimeMocks,
  resetWorktreeSliceModuleMemory
} from './worktrees-slice-test-harness'

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }
}))
vi.mock('@/components/worktree-base-fallback-notice', () => ({
  requestWorktreeBaseFallbackNotice: vi.fn()
}))

beforeEach(() => {
  resetWorktreeSliceModuleMemory()
  vi.clearAllMocks()
  resetRemoteRuntimeMocks()
})

describe('ORCAW-010 failed scan terminal retention', () => {
  it('retains terminal ownership through a failed scan and subsequent authoritative recovery', async () => {
    const store = createTestStore()
    const worktree = makeWorktree({ id: 'repo1::/path/wt1', repoId: 'repo1', path: '/path/wt1' })
    const tab = makeTerminalTab({ id: 'tab-1', worktreeId: worktree.id, ptyId: 'live-pty' })
    const tabsByWorktree = { [worktree.id]: [tab] }
    const activeTabIdByWorktree = { [worktree.id]: tab.id }
    const ptyIdsByTabId = { [tab.id]: ['live-pty'] }
    store.setState({
      worktreesByRepo: { repo1: [worktree] },
      tabsByWorktree,
      activeTabIdByWorktree,
      ptyIdsByTabId,
      activeWorktreeId: worktree.id,
      sortEpoch: 7
    })
    mockApi.worktrees.listDetected
      .mockResolvedValueOnce(
        makeDetectedResult('repo1', [], {
          authoritative: false,
          source: 'metadata-fallback',
          unavailableReason: 'wsl.exe timed out'
        })
      )
      .mockResolvedValueOnce(makeDetectedResult('repo1', [worktree]))

    expect(await store.getState().fetchWorktrees('repo1')).toBe(false)
    expect(store.getState().tabsByWorktree).toBe(tabsByWorktree)
    expect(store.getState().activeTabIdByWorktree).toBe(activeTabIdByWorktree)
    expect(store.getState().ptyIdsByTabId).toBe(ptyIdsByTabId)
    expect(store.getState().shutdownWorktreeTerminals).not.toHaveBeenCalled()
    expect(store.getState().activeWorktreeId).toBe(worktree.id)
    expect(store.getState().worktreesByRepo.repo1).toEqual([worktree])

    expect(await store.getState().fetchWorktrees('repo1')).toBe(true)
    expect(store.getState().tabsByWorktree).toBe(tabsByWorktree)
    expect(store.getState().activeTabIdByWorktree).toBe(activeTabIdByWorktree)
    expect(store.getState().ptyIdsByTabId).toBe(ptyIdsByTabId)
    expect(store.getState().shutdownWorktreeTerminals).not.toHaveBeenCalled()
    expect(mockApi.pty.kill).not.toHaveBeenCalled()
    expect(mockApi.worktrees.remove).not.toHaveBeenCalled()
  })
})
