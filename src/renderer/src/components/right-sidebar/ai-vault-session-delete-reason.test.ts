import { describe, expect, it } from 'vitest'
import { aiVaultSessionDeleteReasonText } from './ai-vault-session-delete-reason'

// translate() with no loaded catalog returns the English fallback, so these
// assertions pin the English copy.
describe('aiVaultSessionDeleteReasonText', () => {
  it('explains a non-local host', () => {
    expect(
      aiVaultSessionDeleteReasonText({ deletable: false, reason: 'non-local-host' }, 'gemini')
    ).toBe('Only sessions on this device can be deleted.')
  })

  it('states the limit without exposing storage internals for a synthetic path', () => {
    expect(
      aiVaultSessionDeleteReasonText({ deletable: false, reason: 'synthetic-path' }, 'opencode')
    ).toBe("This session can't be deleted from Orca.")
  })

  it('names the agent without explaining why it is unsupported', () => {
    expect(
      aiVaultSessionDeleteReasonText({ deletable: false, reason: 'unsupported-agent' }, 'claude')
    ).toBe("Claude sessions can't be deleted from Orca.")
  })

  it('gives a multi-cause agent the same single sentence', () => {
    expect(
      aiVaultSessionDeleteReasonText(
        { deletable: false, reason: 'unsupported-agent' },
        'antigravity'
      )
    ).toBe("Antigravity sessions can't be deleted from Orca.")
  })

  it('tells the user to wait when the session is still running', () => {
    expect(
      aiVaultSessionDeleteReasonText({ deletable: false, reason: 'session-live' }, 'gemini')
    ).toBe('This session is still running — wait for it to finish before deleting.')
  })
})
