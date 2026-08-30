import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'

const mocks = vi.hoisted(() => ({
  activateAndRevealWorktree: vi.fn(),
  state: {
    activeWorktreeId: null as string | null,
    activeWorkspaceExecutionHostId: null as string | null,
    updateWorktreeMeta: vi.fn(),
    worktreesByRepo: {} as Record<string, Worktree[]>
  },
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateAndRevealWorktree
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}))

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::child',
    instanceId: 'child-instance',
    repoId: 'repo-1',
    path: '/repo/child',
    displayName: 'child',
    branch: 'refs/heads/child',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  } as Worktree
}

describe('worktree hidden state actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.activeWorktreeId = null
    mocks.state.activeWorkspaceExecutionHostId = null
    mocks.state.updateWorktreeMeta.mockResolvedValue({ ok: true })
    mocks.state.worktreesByRepo = {}
  })

  it('persists a host-qualified hidden state with an instance guard', async () => {
    const worktree = makeWorktree({ hostId: 'ssh:dev' })
    const { setWorktreeHiddenInOrca } = await import('./worktree-hidden-state-actions')

    await setWorktreeHiddenInOrca(worktree, true)

    expect(mocks.state.updateWorktreeMeta).toHaveBeenCalledWith(
      worktree.id,
      { isArchived: true },
      expect.objectContaining({ executionHostId: 'ssh:dev', shouldApply: expect.any(Function) })
    )
    const options = mocks.state.updateWorktreeMeta.mock.calls[0]?.[2]
    expect(options.shouldApply(makeWorktree({ instanceId: 'child-instance' }))).toBe(true)
    expect(options.shouldApply(makeWorktree({ instanceId: 'replacement' }))).toBe(false)
  })

  it('moves an active hidden child to the primary worktree without stopping processes', async () => {
    const child = makeWorktree()
    const main = makeWorktree({
      id: 'repo-1::main',
      instanceId: 'main-instance',
      isMainWorktree: true
    })
    mocks.state.activeWorktreeId = child.id
    mocks.state.worktreesByRepo = { 'repo-1': [main, child] }
    const { hideWorktreeFromOrca } = await import('./worktree-hidden-state-actions')

    await hideWorktreeFromOrca(child)

    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith(
      main.id,
      expect.objectContaining({ revealInSidebar: true })
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Worktree hidden from Orca',
      expect.objectContaining({
        description: 'Its files, Git worktree, branch, and running processes were not deleted.'
      })
    )
  })

  it('reports persistence failures without navigating', async () => {
    mocks.state.updateWorktreeMeta.mockResolvedValue({ ok: false, error: 'offline' })
    const { hideWorktreeFromOrca } = await import('./worktree-hidden-state-actions')

    await hideWorktreeFromOrca(makeWorktree())

    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Could not hide this worktree', {
      description: 'offline'
    })
  })
})
