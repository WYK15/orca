// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { useAiVaultBulkSessionDelete } from './use-ai-vault-bulk-session-delete'
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  deleteSession: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => mocks.confirm
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))
function session(id: string, overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id,
    sessionId: id,
    agent: 'gemini',
    title: id,
    filePath: `/home/a/.gemini/tmp/${id}.json`,
    codexHome: null,
    executionHostId: 'local',
    ...overrides
  } as AiVaultSession
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.confirm.mockResolvedValue(true)
  mocks.deleteSession.mockResolvedValue({ outcome: 'deleted' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { deleteSession: mocks.deleteSession } }
  })
})
afterEach(() => {
  cleanup()
  delete (window as unknown as { api?: unknown }).api
})
function setup(sessions: AiVaultSession[]) {
  const refresh = vi.fn().mockResolvedValue(undefined)
  const hook = renderHook(() =>
    useAiVaultBulkSessionDelete({ filteredSessions: sessions, refresh })
  )
  act(() => hook.result.current.enterSelectionMode())
  for (const s of sessions) {
    act(() => hook.result.current.toggleSession(s))
  }
  return { ...hook, refresh }
}
describe('bulk deletion', () => {
  it('confirms once, reuses single IPC, and refreshes once for Codex plus generic sessions', async () => {
    const codex = session('a', {
      agent: 'codex',
      filePath: '/home/a/.codex/sessions/a.jsonl',
      codexHome: '/home/a/.codex'
    })
    const { result, refresh } = setup([codex, session('b')])
    await act(async () => result.current.deleteSelected())
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.deleteSession).toHaveBeenCalledTimes(2)
    expect(mocks.deleteSession).toHaveBeenNthCalledWith(1, {
      agent: 'codex',
      sessionId: 'a',
      codexHome: '/home/a/.codex',
      filePath: codex.filePath,
      executionHostId: 'local'
    })
    expect(refresh).toHaveBeenCalledExactlyOnceWith({ force: true })
    expect(result.current.selectedSessionIds.size).toBe(0)
  })
  it('retains only failed selections and reports partial failure', async () => {
    mocks.deleteSession
      .mockResolvedValueOnce({ outcome: 'deleted' })
      .mockResolvedValueOnce({ outcome: 'failed' })
      .mockRejectedValueOnce(new Error('IPC disconnected'))
    const { result, refresh } = setup(['a', 'b', 'c'].map((id) => session(id)))
    await act(async () => result.current.deleteSelected())
    expect([...result.current.selectedSessionIds]).toEqual(['b', 'c'])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
  })
  it('does not mutate on cancel or refresh when every delete fails', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    const { result, refresh } = setup([session('a')])
    await act(async () => result.current.deleteSelected())
    expect(mocks.deleteSession).not.toHaveBeenCalled()
    expect(result.current.selectedSessionIds.has('a')).toBe(true)
    mocks.deleteSession.mockResolvedValue({ outcome: 'rejected' })
    await act(async () => result.current.deleteSelected())
    expect(refresh).not.toHaveBeenCalled()
    expect(result.current.selectedSessionIds.has('a')).toBe(true)
  })
  it('excludes remote, WSL Codex, synthetic, unsupported and structured rows', () => {
    const { result } = setup([
      session('remote', { executionHostId: 'ssh:box' }),
      session('wsl', { agent: 'codex', filePath: '\\\\wsl$\\Ubuntu\\home\\a.jsonl' }),
      session('sqlite', { filePath: '/db#id' }),
      session('unsupported', { agent: 'opencode' }),
      session('structured', {
        structuredSession: {} as NonNullable<AiVaultSession['structuredSession']>
      })
    ])
    expect(result.current.selectedSessionIds.size).toBe(0)
  })
})
