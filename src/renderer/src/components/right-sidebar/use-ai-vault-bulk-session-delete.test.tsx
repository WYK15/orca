// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}))

function session(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'session-1',
    sessionId: 'session-1',
    agent: 'gemini',
    title: 'Session 1',
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: '/home/ada/.gemini/tmp/session.json',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-08-22T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
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

describe('useAiVaultBulkSessionDelete', () => {
  it('confirms once, deletes every selected session, and refreshes once', async () => {
    const codexSession = session({
      id: 'codex-1',
      sessionId: 'codex-1',
      agent: 'codex',
      filePath: '/home/ada/.codex/sessions/2026/08/codex-1.jsonl',
      codexHome: '/home/ada/.codex'
    })
    const geminiSession = session({ id: 'gemini-1', sessionId: 'gemini-1' })
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useAiVaultBulkSessionDelete({
        filteredSessions: [codexSession, geminiSession],
        refresh
      })
    )

    act(() => result.current.enterSelectionMode())
    act(() => result.current.toggleSession(codexSession))
    act(() => result.current.toggleSession(geminiSession))
    await act(async () => result.current.deleteSelected())

    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.deleteSession).toHaveBeenNthCalledWith(1, {
      agent: 'codex',
      sessionId: 'codex-1',
      codexHome: '/home/ada/.codex',
      filePath: codexSession.filePath,
      executionHostId: 'local'
    })
    expect(mocks.deleteSession).toHaveBeenNthCalledWith(2, {
      agent: 'gemini',
      sessionId: 'gemini-1',
      codexHome: null,
      filePath: geminiSession.filePath,
      executionHostId: 'local'
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(result.current.selectedSessionIds.size).toBe(0)
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps unsupported sessions out of the selection', () => {
    const unsupported = session({ agent: 'opencode' })
    const { result } = renderHook(() =>
      useAiVaultBulkSessionDelete({
        filteredSessions: [unsupported],
        refresh: vi.fn().mockResolvedValue(undefined)
      })
    )

    act(() => result.current.enterSelectionMode())
    act(() => result.current.toggleSession(unsupported))

    expect(result.current.selectedSessionIds.size).toBe(0)
  })
})
