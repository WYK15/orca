import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultListResult, AiVaultSession } from '../../shared/ai-vault-types'
import type { IFilesystemProvider } from '../providers/types'
import type * as CachedSessionListModule from '../ai-vault/cached-session-list'
import type * as SessionParseCacheModule from '../ai-vault/session-scanner-parse-cache'
import { getRemoteHostPlatform } from '../ssh/ssh-remote-platform'

const mocks = vi.hoisted(() => ({
  scanAiVaultSessions: vi.fn(),
  scanRemoteAiVaultSessions: vi.fn(),
  listClaudeSubagentSessions: vi.fn(),
  scanRuntimeAiVaultSessions: vi.fn(),
  getAiVaultWslHomeDirs: vi.fn(),
  getSshFilesystemProvider: vi.fn(),
  getActiveSshAiVaultHostInfo: vi.fn(),
  getActiveSshAiVaultHostInfos: vi.fn(),
  ipcHandle: vi.fn(),
  deleteAiVaultSessionFile: vi.fn(),
  deleteCodexAiVaultSession: vi.fn(),
  invalidateAiVaultSessionListCache: vi.fn(),
  invalidateSessionParseCacheEntry: vi.fn()
}))

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  ipcMain: { handle: mocks.ipcHandle }
}))

vi.mock('../ai-vault/session-scanner', () => ({
  scanAiVaultSessions: mocks.scanAiVaultSessions
}))

vi.mock('../ai-vault/remote-session-scanner', () => ({
  scanRemoteAiVaultSessions: mocks.scanRemoteAiVaultSessions
}))

vi.mock('../ai-vault/session-scanner-claude-subagents', () => ({
  listClaudeSubagentSessions: mocks.listClaudeSubagentSessions
}))

vi.mock('../ai-vault/session-delete', () => ({
  deleteAiVaultSessionFile: mocks.deleteAiVaultSessionFile
}))

vi.mock('../ai-vault/codex-session-delete', () => ({
  deleteCodexAiVaultSession: mocks.deleteCodexAiVaultSession,
  codexHomesForAiVaultDeletion: vi.fn().mockReturnValue([])
}))

// Why: only the invalidation seam is replaced — everything else (cachedList,
// listAiVaultSessions, ...) keeps its real implementation so the existing
// host-routing/caching tests below stay exercising real behavior.
vi.mock('../ai-vault/cached-session-list', async (importOriginal) => {
  const actual = await importOriginal<typeof CachedSessionListModule>()
  return {
    ...actual,
    invalidateAiVaultSessionListCache: mocks.invalidateAiVaultSessionListCache
  }
})

vi.mock('../ai-vault/session-scanner-parse-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionParseCacheModule>()
  return {
    ...actual,
    invalidateSessionParseCacheEntry: mocks.invalidateSessionParseCacheEntry
  }
})

vi.mock('../wsl', () => ({
  getWslHomeAsync: mocks.getAiVaultWslHomeDirs,
  listWslDistrosAsync: vi.fn().mockResolvedValue([])
}))

vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  SSH_FILESYSTEM_PROVIDER_UNAVAILABLE_MESSAGE:
    'Remote connection dropped. Click Reconnect on the SSH target before retrying.',
  getSshFilesystemProvider: mocks.getSshFilesystemProvider
}))

vi.mock('./ssh', () => ({
  getActiveSshAiVaultHostInfo: mocks.getActiveSshAiVaultHostInfo,
  getActiveSshAiVaultHostInfos: mocks.getActiveSshAiVaultHostInfos
}))

const { _internals, registerAiVaultHandlers } = await import('./ai-vault')

const provider = {} as IFilesystemProvider

beforeEach(() => {
  vi.clearAllMocks()
  _internals.resetAiVaultCacheForTests()
  mocks.scanAiVaultSessions.mockResolvedValue(result([session('local', 'local-session')]))
  mocks.scanRemoteAiVaultSessions.mockResolvedValue(
    result([session('ssh:dev-box', 'remote-session')])
  )
  mocks.listClaudeSubagentSessions.mockResolvedValue({ sessions: [], issues: [] })
  mocks.scanRuntimeAiVaultSessions.mockResolvedValue(
    result([session('runtime:remote-server', 'runtime-session')])
  )
  mocks.getSshFilesystemProvider.mockReturnValue(provider)
  mocks.getActiveSshAiVaultHostInfo.mockReturnValue(hostInfo('dev-box'))
  mocks.getActiveSshAiVaultHostInfos.mockReturnValue([hostInfo('dev-box')])
})

describe('listAiVaultSessions host routing', () => {
  it('routes local scope to the local scanner', async () => {
    await _internals.listAiVaultSessions({ executionHostScope: 'local', scopePaths: ['/repo'] })

    expect(mocks.scanAiVaultSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        scopePaths: ['/repo'],
        executionHostId: 'local'
      })
    )
    expect(mocks.scanRemoteAiVaultSessions).not.toHaveBeenCalled()
  })

  it('routes SSH scope to only that SSH target', async () => {
    await _internals.listAiVaultSessions({
      executionHostScope: 'ssh:dev-box',
      scopePaths: ['/home/ada/repo']
    })

    expect(mocks.scanAiVaultSessions).not.toHaveBeenCalled()
    expect(mocks.getActiveSshAiVaultHostInfo).toHaveBeenCalledWith('dev-box')
    expect(mocks.scanRemoteAiVaultSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        executionHostId: 'ssh:dev-box',
        remoteHome: '/home/ada',
        scopePaths: ['/home/ada/repo']
      })
    )
  })

  it('merges local plus connected SSH targets for all hosts', async () => {
    const result = await _internals.listAiVaultSessions({ executionHostScope: 'all' })

    expect(mocks.scanAiVaultSessions).toHaveBeenCalledTimes(1)
    expect(mocks.scanRemoteAiVaultSessions).toHaveBeenCalledTimes(1)
    expect(result.sessions.map((entry) => entry.executionHostId)).toEqual(['ssh:dev-box', 'local'])
  })

  it('merges paired runtime servers for all hosts', async () => {
    registerAiVaultHandlers({
      getActiveRuntimeAiVaultHostInfos: () => [
        {
          environmentId: 'remote-server',
          executionHostId: 'runtime:remote-server'
        }
      ],
      scanRuntimeAiVaultSessions: mocks.scanRuntimeAiVaultSessions
    })

    const result = await _internals.listAiVaultSessions({ executionHostScope: 'all' })

    expect(mocks.scanRuntimeAiVaultSessions).toHaveBeenCalledWith(
      'remote-server',
      {
        executionHostScope: 'runtime:remote-server'
      },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
    expect(result.sessions.map((entry) => entry.executionHostId)).toEqual([
      'runtime:remote-server',
      'ssh:dev-box',
      'local'
    ])
  })

  it('keeps local and SSH results when runtime host discovery fails', async () => {
    registerAiVaultHandlers({
      getActiveRuntimeAiVaultHostInfos: () => {
        throw new Error('runtime store is invalid')
      },
      scanRuntimeAiVaultSessions: mocks.scanRuntimeAiVaultSessions
    })

    const result = await _internals.listAiVaultSessions({ executionHostScope: 'all' })

    expect(mocks.scanAiVaultSessions).toHaveBeenCalledTimes(1)
    expect(mocks.scanRemoteAiVaultSessions).toHaveBeenCalledTimes(1)
    expect(mocks.scanRuntimeAiVaultSessions).not.toHaveBeenCalled()
    expect(result.sessions.map((entry) => entry.executionHostId)).toEqual(['ssh:dev-box', 'local'])
    expect(result.issues).toEqual([
      expect.objectContaining({
        agent: 'codex',
        path: 'runtime environments',
        message: 'runtime store is invalid'
      })
    ])
  })

  it('keeps direct runtime host scans on the normal runtime timeout', async () => {
    registerAiVaultHandlers({
      getActiveRuntimeAiVaultHostInfos: () => [],
      scanRuntimeAiVaultSessions: mocks.scanRuntimeAiVaultSessions
    })

    await _internals.listAiVaultSessions({
      executionHostScope: 'runtime:remote-server',
      force: true
    })

    expect(mocks.scanRuntimeAiVaultSessions).toHaveBeenCalledWith(
      'remote-server',
      {
        executionHostScope: 'runtime:remote-server',
        force: true
      },
      {}
    )
  })

  it('returns a scan issue for a disconnected SSH target', async () => {
    mocks.getActiveSshAiVaultHostInfo.mockReturnValue(null)
    mocks.getSshFilesystemProvider.mockReturnValue(undefined)

    const result = await _internals.listAiVaultSessions({
      executionHostScope: 'ssh:disconnected'
    })

    expect(result.sessions).toEqual([])
    expect(result.issues).toMatchObject([
      {
        executionHostId: 'ssh:disconnected',
        agent: 'codex',
        path: 'disconnected'
      }
    ])
  })

  it('keeps host scope in the cache key', async () => {
    await _internals.listAiVaultSessions({ executionHostScope: 'local' })
    await _internals.listAiVaultSessions({ executionHostScope: 'ssh:dev-box' })

    expect(mocks.scanAiVaultSessions).toHaveBeenCalledTimes(1)
    expect(mocks.scanRemoteAiVaultSessions).toHaveBeenCalledTimes(1)
  })
})

describe('prepareSessionResume IPC', () => {
  it('awaits the host-local targeted resume preparation', async () => {
    const prepareSessionResume = vi.fn().mockResolvedValue({ useRealCodexHome: true })
    registerAiVaultHandlers({ prepareSessionResume })
    const registration = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === 'aiVault:prepareSessionResume'
    )
    const handler = registration?.[1] as
      | ((_event: unknown, args: unknown) => Promise<unknown>)
      | undefined
    const args = {
      agent: 'codex',
      filePath: '/managed/sessions/2026/07/20/rollout-a.jsonl',
      codexHome: '/managed',
      executionHostId: 'local'
    }

    await expect(handler?.({}, args)).resolves.toEqual({ useRealCodexHome: true })
    expect(prepareSessionResume).toHaveBeenCalledWith(args)
  })

  it('prepares saved-runtime sessions on the transcript-owning runtime', async () => {
    const prepareSessionResume = vi.fn()
    const prepareRuntimeSessionResume = vi.fn().mockResolvedValue({ useRealCodexHome: true })
    registerAiVaultHandlers({ prepareSessionResume, prepareRuntimeSessionResume })
    const args = {
      agent: 'codex' as const,
      filePath: '/managed/sessions/2026/07/20/rollout-a.jsonl',
      codexHome: '/managed',
      executionHostId: 'runtime:env-123' as const
    }

    await expect(getPrepareSessionResumeHandler()({}, args)).resolves.toEqual({
      useRealCodexHome: true
    })
    expect(prepareRuntimeSessionResume).toHaveBeenCalledWith('env-123', args)
    expect(prepareSessionResume).not.toHaveBeenCalled()
  })

  it('preserves SSH session homes without reading their paths locally', async () => {
    const prepareSessionResume = vi.fn()
    const prepareRuntimeSessionResume = vi.fn()
    registerAiVaultHandlers({ prepareSessionResume, prepareRuntimeSessionResume })

    await expect(
      getPrepareSessionResumeHandler()(
        {},
        {
          agent: 'codex',
          filePath: '/managed/sessions/2026/07/20/rollout-a.jsonl',
          codexHome: '/managed',
          executionHostId: 'ssh:dev-box'
        }
      )
    ).resolves.toEqual({ useRealCodexHome: false })
    expect(prepareSessionResume).not.toHaveBeenCalled()
    expect(prepareRuntimeSessionResume).not.toHaveBeenCalled()
  })
})

function getPrepareSessionResumeHandler(): (
  event: unknown,
  args: unknown
) => Promise<{ useRealCodexHome: boolean }> {
  const registration = mocks.ipcHandle.mock.calls.find(
    ([channel]) => channel === 'aiVault:prepareSessionResume'
  )
  if (!registration) {
    throw new Error('aiVault:prepareSessionResume was not registered')
  }
  return registration[1]
}

describe('listAiVaultSubagentSessions gating', () => {
  const claudeRoot = join(homedir(), '.claude', 'projects')

  it('lists subagents for a local Claude session inside the projects root', async () => {
    const parentFilePath = join(claudeRoot, 'proj', 'sess.jsonl')

    await _internals.listAiVaultSubagentSessions({
      agent: 'claude',
      parentFilePath,
      executionHostId: 'local'
    })

    expect(mocks.listClaudeSubagentSessions).toHaveBeenCalledWith({ parentFilePath })
  })

  it('returns empty for a remote Claude session without reading the filesystem', async () => {
    const result = await _internals.listAiVaultSubagentSessions({
      agent: 'claude',
      parentFilePath: join(claudeRoot, 'proj', 'sess.jsonl'),
      executionHostId: 'ssh:dev-box'
    })

    expect(result).toEqual({ sessions: [], issues: [] })
    expect(mocks.listClaudeSubagentSessions).not.toHaveBeenCalled()
  })

  it('rejects a path outside the Claude projects root', async () => {
    const result = await _internals.listAiVaultSubagentSessions({
      agent: 'claude',
      parentFilePath: '/etc/secrets/subagents',
      executionHostId: 'local'
    })

    expect(result).toEqual({ sessions: [], issues: [] })
    expect(mocks.listClaudeSubagentSessions).not.toHaveBeenCalled()
  })

  it('rejects a dot-segment traversal out of the Claude projects root', async () => {
    // Built with sep (not join) so the `..` segments survive into the arg.
    const traversal = [claudeRoot, '..', '..', '..', 'etc', 'passwd.jsonl'].join(sep)

    const result = await _internals.listAiVaultSubagentSessions({
      agent: 'claude',
      parentFilePath: traversal,
      executionHostId: 'local'
    })

    expect(result).toEqual({ sessions: [], issues: [] })
    expect(mocks.listClaudeSubagentSessions).not.toHaveBeenCalled()
  })

  it('resolves empty for malformed IPC payloads instead of throwing', async () => {
    const missing = await _internals.listAiVaultSubagentSessions(undefined)
    const badPath = await _internals.listAiVaultSubagentSessions({
      agent: 'claude',
      parentFilePath: 42 as unknown as string,
      executionHostId: 'local'
    })

    expect(missing).toEqual({ sessions: [], issues: [] })
    expect(badPath).toEqual({ sessions: [], issues: [] })
    expect(mocks.listClaudeSubagentSessions).not.toHaveBeenCalled()
  })

  it('returns empty for a non-Claude agent', async () => {
    const result = await _internals.listAiVaultSubagentSessions({
      agent: 'codex',
      parentFilePath: join(claudeRoot, 'proj', 'sess.jsonl'),
      executionHostId: 'local'
    })

    expect(result).toEqual({ sessions: [], issues: [] })
    expect(mocks.listClaudeSubagentSessions).not.toHaveBeenCalled()
  })
})

describe('deleteAiVaultSession', () => {
  const args = {
    agent: 'gemini' as const,
    filePath: '/home/ada/.gemini/tmp/sess.json',
    executionHostId: 'local' as const
  }

  it('invalidates every AI Vault cache after a real delete', async () => {
    mocks.deleteAiVaultSessionFile.mockResolvedValue({ outcome: 'deleted' })

    const result = await _internals.deleteAiVaultSession(args)

    expect(result).toEqual({ outcome: 'deleted' })
    expect(mocks.deleteAiVaultSessionFile).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'gemini',
        filePath: args.filePath,
        executionHostId: 'local'
      })
    )
    expect(mocks.invalidateAiVaultSessionListCache).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateSessionParseCacheEntry).toHaveBeenCalledWith(args.filePath)
  })

  it('routes Codex through its complete-session deleter', async () => {
    mocks.deleteCodexAiVaultSession.mockResolvedValue({ outcome: 'deleted' })
    const codexArgs = {
      agent: 'codex' as const,
      sessionId: 'session-a',
      codexHome: null,
      filePath: '/home/ada/.codex/sessions/2026/08/05/a.jsonl',
      executionHostId: 'local' as const
    }

    await expect(_internals.deleteAiVaultSession(codexArgs)).resolves.toEqual({
      outcome: 'deleted'
    })

    expect(mocks.deleteCodexAiVaultSession).toHaveBeenCalledWith(codexArgs, expect.any(Object))
    expect(mocks.deleteAiVaultSessionFile).not.toHaveBeenCalled()
    expect(mocks.invalidateSessionParseCacheEntry).toHaveBeenCalledWith(codexArgs.filePath)
  })

  it('does not invalidate any cache when the executor rejects (e.g. non-local host)', async () => {
    mocks.deleteAiVaultSessionFile.mockResolvedValue({
      outcome: 'rejected',
      agent: 'gemini',
      reason: 'non-local-host'
    })

    const result = await _internals.deleteAiVaultSession({
      ...args,
      executionHostId: 'ssh:dev-box'
    })

    expect(result).toEqual({ outcome: 'rejected', agent: 'gemini', reason: 'non-local-host' })
    expect(mocks.invalidateAiVaultSessionListCache).not.toHaveBeenCalled()
    expect(mocks.invalidateSessionParseCacheEntry).not.toHaveBeenCalled()
  })

  it('does not invalidate any cache when the executor fails', async () => {
    mocks.deleteAiVaultSessionFile.mockResolvedValue({
      outcome: 'failed',
      agent: 'gemini',
      error: 'EPERM'
    })

    await _internals.deleteAiVaultSession(args)

    expect(mocks.invalidateAiVaultSessionListCache).not.toHaveBeenCalled()
    expect(mocks.invalidateSessionParseCacheEntry).not.toHaveBeenCalled()
  })

  it('resolves a malformed payload to a rejection instead of throwing', async () => {
    mocks.deleteAiVaultSessionFile.mockResolvedValue({
      outcome: 'rejected',
      agent: undefined,
      reason: 'invalid-path'
    })

    await expect(_internals.deleteAiVaultSession(undefined)).resolves.toEqual({
      outcome: 'rejected',
      agent: undefined,
      reason: 'invalid-path'
    })
    expect(mocks.deleteAiVaultSessionFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '' })
    )
    expect(mocks.invalidateAiVaultSessionListCache).not.toHaveBeenCalled()
  })

  it('registers the aiVault:deleteSession IPC channel', () => {
    registerAiVaultHandlers()

    expect(mocks.ipcHandle).toHaveBeenCalledWith('aiVault:deleteSession', expect.any(Function))
  })

  // Observes the real multi-host invalidation seam (not mocked) end-to-end:
  // deleting must clear this module's own cache, not only the two shared caches.
  it('clears the multi-host scan-result cache after a real delete', async () => {
    await _internals.listAiVaultSessions({ executionHostScope: 'ssh:dev-box' })
    await _internals.listAiVaultSessions({ executionHostScope: 'ssh:dev-box' })
    // Second list is a cache hit, so only one scan so far.
    expect(mocks.scanRemoteAiVaultSessions).toHaveBeenCalledTimes(1)

    mocks.deleteAiVaultSessionFile.mockResolvedValue({ outcome: 'deleted' })
    await _internals.deleteAiVaultSession(args)

    // Cache was cleared, so the next list re-scans instead of serving the stale
    // list that still contained the deleted session.
    await _internals.listAiVaultSessions({ executionHostScope: 'ssh:dev-box' })
    expect(mocks.scanRemoteAiVaultSessions).toHaveBeenCalledTimes(2)
  })

  // Generation guard: a scan already in flight when the delete lands must not
  // write its pre-delete result back into the multi-host cache.
  it('does not let an in-flight multi-host scan repopulate the cache after a delete', async () => {
    let resolveScan: (value: AiVaultListResult) => void = () => {}
    mocks.scanRemoteAiVaultSessions.mockReturnValueOnce(
      new Promise<AiVaultListResult>((resolve) => {
        resolveScan = resolve
      })
    )
    const inFlight = _internals.listAiVaultSessions({ executionHostScope: 'ssh:dev-box' })

    mocks.deleteAiVaultSessionFile.mockResolvedValue({ outcome: 'deleted' })
    await _internals.deleteAiVaultSession(args)

    resolveScan(result([session('ssh:dev-box', 'stale-session')]))
    await inFlight

    // The late scan must not have cached its stale result: the next list re-scans.
    await _internals.listAiVaultSessions({ executionHostScope: 'ssh:dev-box' })
    expect(mocks.scanRemoteAiVaultSessions).toHaveBeenCalledTimes(2)
  })
})

function hostInfo(targetId: string) {
  return {
    targetId,
    executionHostId: `ssh:${targetId}` as const,
    remoteHome: '/home/ada',
    hostPlatform: getRemoteHostPlatform('linux-x64')
  }
}

function result(sessions: AiVaultSession[]): AiVaultListResult {
  return { sessions, issues: [], scannedAt: new Date().toISOString() }
}

function session(
  executionHostId: AiVaultSession['executionHostId'],
  sessionId: string
): AiVaultSession {
  return {
    id: `${executionHostId}:codex:${sessionId}:/tmp/${sessionId}.jsonl`,
    executionHostId,
    agent: 'codex',
    sessionId,
    title: sessionId,
    cwd: '/repo',
    branch: null,
    model: null,
    filePath: `/tmp/${sessionId}.jsonl`,
    codexHome: null,
    createdAt: null,
    updatedAt:
      sessionId === 'runtime-session'
        ? '2026-07-04T03:00:00.000Z'
        : sessionId === 'remote-session'
          ? '2026-07-04T02:00:00.000Z'
          : '2026-07-04T01:00:00.000Z',
    modifiedAt: '2026-07-04T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `codex resume ${sessionId}`,
    subagent: null
  }
}
