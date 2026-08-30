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

const worktree = {
  id: 'repo-1::child',
  instanceId: 'child-instance'
} as Worktree

function Harness(): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const { busyArchivedWorktreeId, showArchivedWorktree } = useArchivedWorktreeRecovery((state) =>
    setError(state?.error ?? null)
  )
  return (
    <button type="button" onClick={() => void showArchivedWorktree(worktree)}>
      {busyArchivedWorktreeId ?? error ?? 'show'}
    </button>
  )
}

describe('useArchivedWorktreeRecovery', () => {
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
