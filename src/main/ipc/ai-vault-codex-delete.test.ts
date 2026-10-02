import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  deleteCodex: vi.fn(),
  deleteGeneric: vi.fn(),
  invalidateTitles: vi.fn(),
  invalidateList: vi.fn(),
  invalidateParse: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../ai-vault/codex-session-delete', () => ({
  deleteCodexAiVaultSession: mocks.deleteCodex
}))
vi.mock('../ai-vault/session-delete', () => ({ deleteAiVaultSessionFile: mocks.deleteGeneric }))
vi.mock('../ai-vault/session-scanner-codex-title-index', () => ({
  invalidateCodexSessionIndexTitleCache: mocks.invalidateTitles
}))
vi.mock('../ai-vault/cached-session-list', () => ({
  getAiVaultWslHomeDirs: vi.fn(),
  invalidateAiVaultSessionListCache: mocks.invalidateList
}))
vi.mock('../ai-vault/session-scanner-parse-cache', () => ({
  invalidateSessionParseCacheEntry: mocks.invalidateParse
}))
vi.mock('../ai-vault/session-scanner-background', () => ({
  invalidateAiVaultBackgroundCache: vi.fn()
}))
import { deleteAiVaultSession } from './ai-vault-delete'
it('routes Codex through complete deletion and invalidates every deleted alias', async () => {
  const invalidateMultiHostListCache = vi.fn()
  const invalidateBackgroundCache = vi.fn().mockResolvedValue(undefined)
  mocks.deleteCodex.mockImplementation(async (_args, deps) => {
    deps.onDeleted(['/default/a.jsonl', '/managed/a.jsonl'], ['/default', '/managed'])
    return { outcome: 'deleted' }
  })
  const args = {
    agent: 'codex' as const,
    sessionId: 'a',
    filePath: '/default/a.jsonl',
    executionHostId: 'local' as const
  }
  expect(
    await deleteAiVaultSession(args, {
      invalidateMultiHostListCache,
      invalidateBackgroundCache,
      getAdditionalCodexHomePaths: () => ['/custom']
    })
  ).toEqual({ outcome: 'deleted' })
  expect(mocks.deleteGeneric).not.toHaveBeenCalled()
  expect(mocks.deleteCodex).toHaveBeenCalledWith(
    args,
    expect.objectContaining({ additionalCodexHomePaths: ['/custom'] })
  )
  expect(mocks.invalidateTitles).toHaveBeenCalledWith(['/default', '/managed'])
  expect(invalidateBackgroundCache).toHaveBeenCalledWith(['/default/a.jsonl', '/managed/a.jsonl'])
  expect(mocks.invalidateParse).toHaveBeenCalledWith('/default/a.jsonl')
  expect(mocks.invalidateParse).toHaveBeenCalledWith('/managed/a.jsonl')
  expect(invalidateMultiHostListCache).toHaveBeenCalledTimes(1)
})
