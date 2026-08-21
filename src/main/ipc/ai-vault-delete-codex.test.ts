import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  codexHomesForAiVaultDeletion: vi.fn(),
  deleteAiVaultSessionFile: vi.fn(),
  deleteCodexAiVaultSession: vi.fn(),
  getAiVaultWslHomeDirs: vi.fn(),
  invalidateAiVaultBackgroundCache: vi.fn(),
  invalidateAiVaultSessionListCache: vi.fn(),
  invalidateCodexSessionIndexTitleCache: vi.fn(),
  invalidateSessionParseCacheEntry: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../ai-vault/codex-session-delete', () => ({
  codexHomesForAiVaultDeletion: mocks.codexHomesForAiVaultDeletion,
  deleteCodexAiVaultSession: mocks.deleteCodexAiVaultSession
}))
vi.mock('../ai-vault/session-delete', () => ({
  deleteAiVaultSessionFile: mocks.deleteAiVaultSessionFile
}))
vi.mock('../ai-vault/cached-session-list', () => ({
  getAiVaultWslHomeDirs: mocks.getAiVaultWslHomeDirs,
  invalidateAiVaultSessionListCache: mocks.invalidateAiVaultSessionListCache
}))
vi.mock('../ai-vault/session-scanner-background', () => ({
  invalidateAiVaultBackgroundCache: mocks.invalidateAiVaultBackgroundCache
}))
vi.mock('../ai-vault/session-scanner-codex-title-index', () => ({
  invalidateCodexSessionIndexTitleCache: mocks.invalidateCodexSessionIndexTitleCache
}))
vi.mock('../ai-vault/session-scanner-parse-cache', () => ({
  invalidateSessionParseCacheEntry: mocks.invalidateSessionParseCacheEntry
}))

const { deleteAiVaultSession } = await import('./ai-vault-delete')

const codexArgs = {
  agent: 'codex' as const,
  sessionId: 'session-1',
  codexHome: '/home/ada/.codex',
  filePath: '/home/ada/.codex/sessions/2026/08/session.jsonl',
  executionHostId: 'local' as const
}

describe('deleteAiVaultSession Codex routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteCodexAiVaultSession.mockResolvedValue({ outcome: 'deleted' })
    mocks.codexHomesForAiVaultDeletion.mockReturnValue([
      '/home/ada/.codex',
      '/app/codex-runtime-home'
    ])
    mocks.invalidateAiVaultBackgroundCache.mockResolvedValue(undefined)
  })

  it('routes Codex through the dedicated deleter and invalidates every cache', async () => {
    const invalidateMultiHostListCache = vi.fn()
    const invalidateBackgroundCache = vi.fn().mockResolvedValue(undefined)

    await expect(
      deleteAiVaultSession(codexArgs, {
        invalidateMultiHostListCache,
        invalidateBackgroundCache,
        getAdditionalCodexHomePaths: () => ['/custom/codex']
      })
    ).resolves.toEqual({ outcome: 'deleted' })

    expect(mocks.deleteCodexAiVaultSession).toHaveBeenCalledWith(codexArgs, {
      additionalCodexHomePaths: ['/custom/codex']
    })
    expect(mocks.deleteAiVaultSessionFile).not.toHaveBeenCalled()
    expect(mocks.invalidateCodexSessionIndexTitleCache).toHaveBeenCalledWith([
      '/home/ada/.codex',
      '/app/codex-runtime-home'
    ])
    expect(invalidateMultiHostListCache).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateAiVaultSessionListCache).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateSessionParseCacheEntry).toHaveBeenCalledWith(codexArgs.filePath)
    expect(invalidateBackgroundCache).toHaveBeenCalledWith([codexArgs.filePath])
  })

  it('does not invalidate caches when Codex deletion is rejected', async () => {
    mocks.deleteCodexAiVaultSession.mockResolvedValue({
      outcome: 'rejected',
      agent: 'codex',
      reason: 'file-predicate-mismatch'
    })
    const invalidateMultiHostListCache = vi.fn()

    await expect(
      deleteAiVaultSession(codexArgs, { invalidateMultiHostListCache })
    ).resolves.toEqual({
      outcome: 'rejected',
      agent: 'codex',
      reason: 'file-predicate-mismatch'
    })

    expect(invalidateMultiHostListCache).not.toHaveBeenCalled()
    expect(mocks.invalidateAiVaultSessionListCache).not.toHaveBeenCalled()
    expect(mocks.invalidateCodexSessionIndexTitleCache).not.toHaveBeenCalled()
    expect(mocks.invalidateSessionParseCacheEntry).not.toHaveBeenCalled()
  })
})
