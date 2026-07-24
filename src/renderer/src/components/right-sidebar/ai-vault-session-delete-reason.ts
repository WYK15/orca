import type { AiVaultAgent } from '../../../../shared/ai-vault-types'
import { agentLabel } from './ai-vault-session-filters'
import { translate } from '@/i18n/i18n'
import type { AiVaultSessionNotDeletableResult } from './ai-vault-session-deletability'

/**
 * Maps a not-deletable judgement to the reason tooltip text shown on the
 * disabled Delete menu item. Says which sessions are affected, never why
 * — the provider's storage layout is Orca's problem, not the reader's. Not the
 * security boundary — see ai-vault-session-deletability.ts.
 */
export function aiVaultSessionDeleteReasonText(
  result: AiVaultSessionNotDeletableResult,
  agent: AiVaultAgent
): string {
  switch (result.reason) {
    case 'non-local-host':
      return translate(
        'auto.components.right.sidebar.AiVaultSessionRow.deleteReasonNonLocalHost',
        'Only sessions on this device can be deleted.'
      )
    case 'synthetic-path':
      return translate(
        'auto.components.right.sidebar.AiVaultSessionRow.deleteReasonSyntheticPath',
        "This session can't be deleted from Orca."
      )
    case 'unsupported-agent':
      return translate(
        'auto.components.right.sidebar.AiVaultSessionRow.deleteReasonUnsupportedAgent',
        "{{value0}} sessions can't be deleted from Orca.",
        { value0: agentLabel(agent) }
      )
  }
}
