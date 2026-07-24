import { isAiVaultDeletableAgent } from '../../../../shared/ai-vault-session-deletion'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import {
  canUseLocalAiVaultSessionPathActions,
  isSyntheticAiVaultSessionPath
} from './ai-vault-session-path-actions'

export type AiVaultSessionDeletabilityReasonCode =
  | 'non-local-host'
  | 'synthetic-path'
  | 'unsupported-agent'

export type AiVaultSessionDeletableResult = { deletable: true }

export type AiVaultSessionNotDeletableResult = {
  deletable: false
  reason: AiVaultSessionDeletabilityReasonCode
}

export type AiVaultSessionDeletabilityResult =
  | AiVaultSessionDeletableResult
  | AiVaultSessionNotDeletableResult

/**
 * Renderer-side judgement of whether AI Vault's UI should offer Delete for a
 * session: enabled, or disabled with a reason a tooltip can render. This is
 * NOT the security boundary — the main-process validator re-checks the
 * path on disk regardless of what this returns.
 *
 * The two layers agree only on deletable-or-not, NOT on the reason code: the
 * order here is host -> synthetic -> agent (agent-independent gates first, which
 * reads better for the user — an SSH session says "remote", not "unsupported
 * agent"), whereas the main validator checks agent first. A session failing
 * two gates can therefore carry a different reason on each side; that is fine
 * because a non-deletable session never reaches the main delete path, so its
 * main-side reason is never shown. What must hold — and does, because both
 * sides consult the same shared deletable-agent set and the same host/synthetic
 * predicates — is that the renderer never enables Delete for a session main
 * would reject (renderer-false is a subset of main-false).
 */
export function resolveAiVaultSessionDeletability(
  session: Pick<AiVaultSession, 'agent' | 'executionHostId' | 'filePath'>
): AiVaultSessionDeletabilityResult {
  if (!canUseLocalAiVaultSessionPathActions(session.executionHostId)) {
    return { deletable: false, reason: 'non-local-host' }
  }
  if (isSyntheticAiVaultSessionPath(session.filePath)) {
    return { deletable: false, reason: 'synthetic-path' }
  }
  if (!isAiVaultDeletableAgent(session.agent)) {
    return { deletable: false, reason: 'unsupported-agent' }
  }
  return { deletable: true }
}
