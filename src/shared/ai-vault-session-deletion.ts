import type { AiVaultAgent } from './ai-vault-types'
import type { ExecutionHostId } from './execution-host'

// IPC payload for aiVault:deleteSession. Kept in this shared module so both the
// main handler and the renderer import one definition.
export type AiVaultDeleteSessionArgs = {
  agent: AiVaultAgent
  filePath: string
  // Codex uses this to locate and verify every transcript alias before delete.
  sessionId?: string
  codexHome?: string | null
  // The session's host; only a local session may be deleted.
  executionHostId?: ExecutionHostId
}

// The delete executor's result shape — imported by both main (IPC
// handler/executor) and the renderer, so it lives where the renderer reaches.
export type AiVaultDeleteSessionResult =
  | { outcome: 'deleted' }
  | { outcome: 'rejected'; agent: AiVaultAgent; reason: AiVaultSessionDeleteRejectionCode }
  | { outcome: 'failed'; agent: AiVaultAgent; error: string }

// Agents whose sessions Orca can remove completely: everything the
// session wrote lives at paths derived from the one path the scanner surfaced,
// and nothing there is shared with another session. For most agents that is a
// single file; for claude, rovo, and grok it is a directory (see
// aiVaultSessionDeleteRemovals). Kept here so main and renderer can never
// disagree on what "supported for deletion" means.
//
// Why the remaining agents are excluded — recorded here because the UI
// deliberately doesn't tell the user (a provider's storage layout is Orca's
// problem, not the reader's):
// - antigravity, kimi: a separate registry (history.jsonl / session_index.jsonl)
//   would keep a dangling entry. Antigravity's history.jsonl carries no
//   conversation id, so which line to drop can't be determined at all.
// - codex: session_index.jsonl plus hardlink aliases between the Orca-managed
//   home and ~/.codex, so a one-sided delete reappears on the next scan.
// - opencode 1.17.x: a SQLite row, not a file; its path is the synthetic
//   <dbPath>#<sessionId> form.
export const AI_VAULT_DELETABLE_AGENTS = [
  'gemini',
  'copilot',
  'cursor',
  'hermes',
  'devin',
  'openclaw',
  'droid',
  'pi',
  'omp',
  'claude',
  'rovo',
  'grok'
] as const satisfies readonly AiVaultAgent[]

export type AiVaultDeletableAgent = (typeof AI_VAULT_DELETABLE_AGENTS)[number]

export function isAiVaultDeletableAgent(agent: AiVaultAgent): agent is AiVaultDeletableAgent {
  return (AI_VAULT_DELETABLE_AGENTS as readonly AiVaultAgent[]).includes(agent)
}

// Codex has a dedicated multi-file deleter, separate from the generic list above.
export function isAiVaultSessionDeleteSupportedAgent(agent: AiVaultAgent): boolean {
  return agent === 'codex' || isAiVaultDeletableAgent(agent)
}

// A '#' marker means an OpenCode 1.17.x SQLite row's synthetic
// `<dbPath>#<sessionId>` identity, not a real file. Mirrors
// isSyntheticAiVaultSessionPath in the renderer (ai-vault-session-path-actions.ts);
// duplicated here rather than imported because main can't reach into renderer/src.
export function isAiVaultSyntheticSessionPath(filePath: string): boolean {
  return filePath.includes('#')
}

export type AiVaultSessionDeleteRejectionCode =
  | 'invalid-path'
  | 'unsupported-agent'
  | 'non-local-host'
  | 'synthetic-path'
  | 'path-outside-known-roots'
  | 'invalid-extension'
  | 'file-predicate-mismatch'
  // A directory-shaped agent's file sits directly in the sessions root, so it
  // names no session directory of its own — removing it would trash every
  // session at once.
  | 'no-session-directory'
  // fs-side guard: a removal's lstat() disagrees with its declared kind — a
  // symlink (lstat never dereferences), or a file where the plan expects a
  // directory and vice versa.
  | 'unexpected-target-kind'

// One path the executor removes. `kind` is what the path must be on disk; a
// mismatch is a rejection, never a coerced delete. `roots` are the directories
// the path's realpath must still resolve inside — a symlinked parent escapes
// the validator's textual root check, which only the fs side can catch.
export type AiVaultSessionDeleteRemoval = {
  path: string
  kind: 'file' | 'directory'
  roots: readonly string[]
}

// CALLER CONTRACT: `allowed: true` is a pure, path-only judgement — the
// validator never touches the filesystem, so it cannot tell a real session
// file from a same-named directory or from a symlink planted inside a root
// that points outside it. Before removing anything, the caller MUST re-check
// each removal on disk against its `kind` and re-resolve it against its
// `roots`. That fs-side guard lives in the delete executor, not here.
export type AiVaultSessionDeleteAllowedResult = {
  allowed: true
  agent: AiVaultDeletableAgent
  // The session's own transcript path — the last entry of `removals`, kept
  // separate because callers (cache invalidation) key off it.
  resolvedPath: string
  // Ordered: companions first, the transcript last. A companion that failed
  // leaves the session row on screen to retry from; removing the transcript
  // first would drop the row and strand the rest on disk.
  removals: readonly AiVaultSessionDeleteRemoval[]
}

export type AiVaultSessionDeleteRejectedResult = {
  allowed: false
  agent: AiVaultAgent
  reason: AiVaultSessionDeleteRejectionCode
}

export type AiVaultSessionDeleteValidationResult =
  | AiVaultSessionDeleteAllowedResult
  | AiVaultSessionDeleteRejectedResult
