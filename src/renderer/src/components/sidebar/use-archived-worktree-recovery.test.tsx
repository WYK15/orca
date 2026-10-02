// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { useArchivedWorktreeRecovery } from './use-archived-worktree-recovery'

const mocks = vi.hoisted(() => ({ setWorktreeHiddenInOrca: vi.fn() }))

vi.mock('./worktree-hidden-state-actions', () => ({
  setWorktreeHiddenInOrca: mocks.setWorktreeHiddenInOrca
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const worktree: Worktree = {
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
  isArchived: true,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
}

function Harness({ scope = 'one' }: { scope?: string }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const { busyArchivedWorktreeId, showArchivedWorktree } = useArchivedWorktreeRecovery(
    (state) => setError(state?.error ?? null),
    scope
  )
  return (
    <button type="button" onClick={() => void showArchivedWorktree(worktree)}>
      {busyArchivedWorktreeId ?? error ?? 'show'}
    </button>
  )
}

describe('useArchivedWorktreeRecovery', () => {
  it('does not publish an old host failure into a newly selected visibility scope', async () => {
    let resolve!: (result: { ok: boolean; error?: string }) => void
    mocks.setWorktreeHiddenInOrca.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => root.render(<Harness scope="ssh:one" />))
    await act(async () => container.querySelector('button')?.click())
    expect(container.textContent).toBe(worktree.id)
    await act(async () => root.render(<Harness scope="ssh:two" />))
    expect(container.textContent).toBe('show')
    await act(async () => resolve({ ok: false, error: 'old host offline' }))
    expect(container.textContent).toBe('show')

    await act(async () => root.unmount())
  })

  it('keeps the restore surface open and reports persistence failures', async () => {
    mocks.setWorktreeHiddenInOrca.mockResolvedValue({ ok: false, error: 'host offline' })
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => root.render(<Harness />))
    await act(async () => container.querySelector('button')?.click())

    expect(mocks.setWorktreeHiddenInOrca).toHaveBeenCalledWith(worktree, false)
    expect(container.textContent).toBe('host offline')
    await act(async () => root.unmount())
  })
})
