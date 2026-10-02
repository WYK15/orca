// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { DetectedWorktree } from '../../../../shared/worktree/types'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  state: {
    activeModal: 'worktree-visibility',
    modalData: { repoId: 'repo-1' },
    closeModal: vi.fn(),
    repos: [] as Repo[],
    updateRepo: vi.fn(),
    updateWorktreeMeta: vi.fn(),
    fetchWorktrees: vi.fn().mockResolvedValue(true),
    detectedWorktreesByRepo: {} as Record<string, unknown>,
    settings: {},
    worktreeVisibilityDefaultsByHost: {}
  }
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))
vi.mock('@/components/ui/dialog', () => {
  const Content = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Dialog: Content,
    DialogContent: Content,
    DialogDescription: Content,
    DialogHeader: Content,
    DialogTitle: Content
  }
})
vi.mock('./HiddenWorktreeRecoveryList', () => ({ default: () => null }))
vi.mock('./WorktreeVisibilitySourceList', () => ({ default: () => null }))
vi.mock('./WorktreeVisibilityHelpPopover', () => ({ default: () => null }))
vi.mock('./WorktreeVisibilityGlobalSettingsLink', () => ({
  WorktreeVisibilityGlobalSettingsLink: () => null
}))
vi.mock('./WorktreeVisibilityScanStatus', () => ({ WorktreeVisibilityScanStatus: () => null }))

import WorktreeVisibilityDialog from './WorktreeVisibilityDialog'

it('restores an archived child independently in the existing visibility dialog', async () => {
  const hidden: DetectedWorktree = {
    id: 'repo-1::/repo/child',
    instanceId: 'hidden-instance',
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
    isArchived: true,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ownership: 'orca-managed',
    selectedCheckout: false,
    visible: false
  }
  mocks.state.repos = [
    {
      id: 'repo-1',
      path: '/repo',
      displayName: 'orca',
      badgeColor: '#000',
      addedAt: 1,
      kind: 'git',
      externalWorktreeVisibility: 'hide',
      externalWorktreeVisibilityPromptDismissedAt: 1
    }
  ]
  mocks.state.detectedWorktreesByRepo = {
    'repo-1': { repoId: 'repo-1', authoritative: true, source: 'git', worktrees: [hidden] }
  }
  mocks.state.updateWorktreeMeta.mockImplementation(async (_id, updates, options) => {
    expect(options.executionHostId).toBe('local')
    expect(options.shouldApply(hidden)).toBe(true)
    Object.assign(hidden, updates)
    return { ok: true }
  })
  const container = document.createElement('div')
  const root = createRoot(container)
  try {
    await act(async () => root.render(<WorktreeVisibilityDialog />))
    expect(container.textContent).toContain('Worktrees hidden by you (1)')
    await act(async () => container.querySelector('button')?.click())
    expect(hidden.isArchived).toBe(false)
    expect(mocks.state.updateRepo).not.toHaveBeenCalled()
    expect(mocks.state.closeModal).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
  }
})
