import { describe, expect, it } from 'vitest'
import { resolveAiVaultSessionDeletability } from './ai-vault-session-deletability'

describe('resolveAiVaultSessionDeletability', () => {
  it('allows a deletable agent on a local, real path', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'gemini',
        executionHostId: 'local',
        filePath: '/home/user/.gemini/sessions/log.jsonl'
      })
    ).toEqual({ deletable: true })
  })

  const localGeminiSession = {
    agent: 'gemini' as const,
    executionHostId: 'local' as const,
    filePath: '/home/user/.gemini/sessions/log.jsonl'
  }

  it('blocks an otherwise-deletable session while its agent is still running', () => {
    for (const live of ['working', 'blocked', 'waiting'] as const) {
      expect(resolveAiVaultSessionDeletability(localGeminiSession, live)).toEqual({
        deletable: false,
        reason: 'session-live'
      })
    }
  })

  it('allows a finished session (done) and one with no live state', () => {
    expect(resolveAiVaultSessionDeletability(localGeminiSession, 'done')).toEqual({
      deletable: true
    })
    expect(resolveAiVaultSessionDeletability(localGeminiSession, null)).toEqual({
      deletable: true
    })
  })

  it('keeps the live-session reason for a running Codex session', () => {
    expect(
      resolveAiVaultSessionDeletability(
        { agent: 'codex', executionHostId: 'local', filePath: '/home/user/.codex/x.jsonl' },
        'working'
      )
    ).toEqual({ deletable: false, reason: 'session-live' })
  })

  it('blocks an ssh-hosted session regardless of agent', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'gemini',
        executionHostId: 'ssh:dev-box',
        filePath: '/home/user/.gemini/sessions/log.jsonl'
      })
    ).toEqual({ deletable: false, reason: 'non-local-host' })
  })

  it('blocks a runtime-hosted session regardless of agent', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'gemini',
        executionHostId: 'runtime:gpu-box',
        filePath: '/home/user/.gemini/sessions/log.jsonl'
      })
    ).toEqual({ deletable: false, reason: 'non-local-host' })
  })

  it('blocks a synthetic OpenCode SQLite row identity', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'opencode',
        executionHostId: 'local',
        filePath: '/home/user/.opencode/db.sqlite#sess_123'
      })
    ).toEqual({
      deletable: false,
      reason: 'synthetic-path'
    })
  })

  it('allows a directory-shaped agent (claude), whose subagents dir goes with it', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'claude',
        executionHostId: 'local',
        filePath: '/home/user/.claude/projects/-proj/sess-1.jsonl'
      })
    ).toEqual({ deletable: true })
  })

  it('blocks a multi-cause agent (antigravity) with the same single reason', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'antigravity',
        executionHostId: 'local',
        filePath: '/home/user/.antigravity/brain/conv-1/.system_generated/logs/transcript.jsonl'
      })
    ).toEqual({
      deletable: false,
      reason: 'unsupported-agent'
    })
  })

  it('allows a finished local Codex session for its dedicated deleter', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'codex',
        executionHostId: 'local',
        filePath: '/home/user/.codex/sessions/log.jsonl'
      })
    ).toEqual({ deletable: true })
  })

  it('blocks a WSL UNC Codex session because its index must be edited in the distro', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'codex',
        executionHostId: 'local',
        filePath: '\\\\wsl$\\Ubuntu\\home\\user\\.codex\\sessions\\a.jsonl'
      })
    ).toEqual({ deletable: false, reason: 'non-local-host' })
  })

  it('blocks opencode on a non-synthetic path as an unsupported agent', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'opencode',
        executionHostId: 'local',
        filePath: '/home/user/.opencode/sessions/log.jsonl'
      })
    ).toEqual({
      deletable: false,
      reason: 'unsupported-agent'
    })
  })

  it('prioritizes the host gate over the unsupported-agent reason', () => {
    expect(
      resolveAiVaultSessionDeletability({
        agent: 'claude',
        executionHostId: 'ssh:dev-box',
        filePath: '/home/user/.claude/sessions/sess-dir/log.jsonl'
      })
    ).toEqual({ deletable: false, reason: 'non-local-host' })
  })
})
