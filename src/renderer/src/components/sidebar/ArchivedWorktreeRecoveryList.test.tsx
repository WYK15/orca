// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import ArchivedWorktreeRecoveryList from './ArchivedWorktreeRecoveryList'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    values
      ? fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''))
      : fallback
}))

function makeWorktree(overrides: Partial<Worktree>): Worktree {
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

describe('ArchivedWorktreeRecoveryList', () => {
  it('lists only manually hidden child worktrees and restores the selected row', async () => {
    const hidden = makeWorktree({ isArchived: true })
    const onShow = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <ArchivedWorktreeRecoveryList
          worktrees={[
            hidden,
            makeWorktree({ id: 'visible', isArchived: false }),
            makeWorktree({ id: 'main', isArchived: true, isMainWorktree: true })
          ]}
          busyWorktreeId={null}
          disabled={false}
          onShow={onShow}
        />
      )
    })

    expect(container.textContent).toContain('Worktrees hidden by you (1)')
    expect(container.textContent).toContain('child')
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Show')
    await act(async () => button?.click())
    expect(onShow).toHaveBeenCalledWith(hidden)

    await act(async () => root.unmount())
  })
})
