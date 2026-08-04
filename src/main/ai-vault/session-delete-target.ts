import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { AiVaultAgent } from '../../shared/ai-vault-types'
import {
  isAiVaultDeletableAgent,
  isAiVaultSyntheticSessionPath,
  type AiVaultDeletableAgent,
  type AiVaultSessionDeleteRejectionCode,
  type AiVaultSessionDeleteRemoval,
  type AiVaultSessionDeleteValidationResult
} from '../../shared/ai-vault-session-deletion'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import {
  claudeProjectsRootDirs,
  COPILOT_SESSIONS_DIR,
  CURSOR_PROJECTS_DIR,
  DEVIN_TRANSCRIPTS_DIR,
  GEMINI_SESSIONS_DIR,
  GROK_SESSIONS_DIR,
  HERMES_SESSIONS_DIR,
  OMP_SESSIONS_DIR,
  OPENCLAW_STATE_DIR,
  PI_SESSIONS_DIR,
  ROVO_SESSIONS_DIR
} from './session-scanner-source-discovery'
import { sessionRootDirs } from './session-scanner-root-dirs'
import { droidSessionRootDirs } from './session-scanner-droid-kimi-sources'
import { openClawAgentsRootDir, isOpenClawSessionFilePath } from './session-scanner-discovery'
import {
  SUBAGENT_DIR_NAME,
  subagentTranscriptsDirFor
} from './session-scanner-subagent-transcripts'
import type { AiVaultScanOptions } from './session-scanner-types'

// The session root dirs a single deletable agent's files must resolve inside
// of. Reuses session-scanner-source-discovery.ts's own per-agent
// constants and its sessionRootDirs() WSL-expansion helper directly so a
// deletion root can never drift from the scanner's own root.
function deletableAgentSessionRootDirs(
  agent: AiVaultDeletableAgent,
  options: AiVaultScanOptions,
  wslHomeDirs: readonly string[]
): string[] {
  switch (agent) {
    case 'gemini':
      return sessionRootDirs(options.geminiSessionsDir ?? GEMINI_SESSIONS_DIR, wslHomeDirs, [
        '.gemini',
        'tmp'
      ])
    case 'copilot':
      return sessionRootDirs(options.copilotSessionsDir ?? COPILOT_SESSIONS_DIR, wslHomeDirs, [
        '.copilot',
        'session-state'
      ])
    case 'cursor':
      return sessionRootDirs(options.cursorProjectsDir ?? CURSOR_PROJECTS_DIR, wslHomeDirs, [
        '.cursor',
        'projects'
      ])
    case 'hermes':
      return sessionRootDirs(options.hermesSessionsDir ?? HERMES_SESSIONS_DIR, wslHomeDirs, [
        '.hermes',
        'sessions'
      ])
    case 'devin':
      return sessionRootDirs(options.devinTranscriptsDir ?? DEVIN_TRANSCRIPTS_DIR, wslHomeDirs, [
        '.local',
        'share',
        'devin',
        'cli',
        'transcripts'
      ])
    case 'pi':
      return sessionRootDirs(options.piSessionsDir ?? PI_SESSIONS_DIR, wslHomeDirs, [
        '.pi',
        'agent',
        'sessions'
      ])
    case 'omp':
      return sessionRootDirs(options.ompSessionsDir ?? OMP_SESSIONS_DIR, wslHomeDirs, [
        '.omp',
        'agent',
        'sessions'
      ])
    case 'openclaw':
      // discoverOpenClawFiles (session-scanner-discovery.ts) scans
      // <stateDir>/agents, not the state dir itself; openClawAgentsRootDir is
      // that scanner's own derivation, reused here so the two can't drift.
      return [
        options.openclawStateDir ?? OPENCLAW_STATE_DIR,
        options.openclawLegacyStateDir ?? join(homedir(), '.clawdbot'),
        ...wslHomeDirs.map((homeDir) => join(homeDir, '.openclaw')),
        ...wslHomeDirs.map((homeDir) => join(homeDir, '.clawdbot'))
      ].map(openClawAgentsRootDir)
    case 'droid':
      return droidSessionRootDirs(options, wslHomeDirs)
    case 'claude':
      return claudeProjectsRootDirs({
        claudeProjectsDir: options.claudeProjectsDir,
        wslHomeDirs
      })
    case 'rovo':
      return sessionRootDirs(options.rovoSessionsDir ?? ROVO_SESSIONS_DIR, wslHomeDirs, [
        '.rovodev',
        'sessions'
      ])
    case 'grok':
      return sessionRootDirs(options.grokSessionsDir ?? GROK_SESSIONS_DIR, wslHomeDirs, [
        '.grok',
        'sessions'
      ])
  }
}

// Matches each deletable agent's discovery extensions (session-scanner-source-discovery.ts).
const AI_VAULT_DELETE_TARGET_EXTENSIONS: Record<AiVaultDeletableAgent, readonly string[]> = {
  gemini: ['.json', '.jsonl'],
  copilot: ['.jsonl'],
  cursor: ['.jsonl'],
  hermes: ['.json'],
  devin: ['.json'],
  openclaw: ['.jsonl'],
  droid: ['.jsonl'],
  pi: ['.jsonl'],
  omp: ['.jsonl'],
  claude: ['.jsonl'],
  rovo: ['.json'],
  grok: ['.json']
}

// Mirrors each agent's discovery filePredicate (session-scanner-source-discovery.ts /
// session-scanner-discovery.ts) so a path the scanner would never have surfaced
// can't be accepted as a delete target either.
const AI_VAULT_DELETE_TARGET_FILE_PREDICATES: Partial<
  Record<AiVaultDeletableAgent, (filePath: string) => boolean>
> = {
  cursor: (filePath) => pathSegments(filePath).includes('agent-transcripts'),
  hermes: (filePath) => basename(filePath).startsWith('session_'),
  openclaw: isOpenClawSessionFilePath,
  // A Task subagent transcript is never a session row of its own (discovery
  // prunes the subtree), so it must not be deletable on its own either — it
  // goes with its parent or not at all.
  claude: (filePath) => !pathSegments(filePath).includes(SUBAGENT_DIR_NAME),
  rovo: (filePath) => basename(filePath) === 'metadata.json',
  grok: (filePath) => basename(filePath) === 'summary.json'
}

// Agents whose session is the directory holding the file the scanner
// surfaced, not the file itself. Everything else in that directory
// belongs to the same session — rovo's session_context.json, grok's
// chat_history.jsonl — so the directory is the only complete delete unit.
const AI_VAULT_DIRECTORY_SHAPED_DELETE_AGENTS = new Set<AiVaultDeletableAgent>(['rovo', 'grok'])

export type ValidateAiVaultSessionDeleteTargetArgs = {
  agent: AiVaultAgent
  filePath: string
  executionHostId: ExecutionHostId | null | undefined
  // WSL homes to expand each agent's roots against, e.g. getAiVaultWslHomeDirs()
  // (cached-session-list.ts). Passed in rather than fetched here so this
  // function stays synchronous and pure.
  wslHomeDirs?: readonly string[]
  // Per-agent root overrides for tests; mirrors AiVaultScanOptions so tests
  // never depend on the real home directory.
  rootOptions?: AiVaultScanOptions
}

// Pure, synchronous judgement of whether an AI Vault session may be deleted
// Never touches the filesystem and never throws on a rejected
// input — IPC payloads are untyped at runtime, so a malformed or hostile
// filePath resolves to a rejection like every other invalid input.
// A returned `allowed: true` is NOT sufficient to delete: see the caller
// contract on AiVaultSessionDeleteAllowedResult (each removal's kind + realpath
// root re-check must run in the fs-touching executor before removal).
export function validateAiVaultSessionDeleteTarget(
  args: ValidateAiVaultSessionDeleteTargetArgs
): AiVaultSessionDeleteValidationResult {
  const { agent } = args
  const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : ''
  if (!filePath) {
    return rejected(agent, 'invalid-path')
  }
  if (!isAiVaultDeletableAgent(agent)) {
    return rejected(agent, 'unsupported-agent')
  }
  // Why: Electron shell/fs APIs only act on this computer; ssh/runtime
  // sessions' paths exist on the remote host instead, same scope limit
  // as canUseLocalAiVaultSessionPathActions for Open/Reveal Log.
  if (normalizeExecutionHostId(args.executionHostId) !== LOCAL_EXECUTION_HOST_ID) {
    return rejected(agent, 'non-local-host')
  }
  if (isAiVaultSyntheticSessionPath(filePath)) {
    return rejected(agent, 'synthetic-path')
  }

  // resolve() collapses `..` segments before the root check runs, matching
  // listAiVaultSubagentSessions (ipc/ai-vault.ts) — isPathInsideOrEqual
  // compares textually and would otherwise pass `<root>/../../etc/x.jsonl`.
  const resolvedPath = resolve(filePath)
  const roots = deletableAgentSessionRootDirs(agent, args.rootOptions ?? {}, args.wslHomeDirs ?? [])
  // Keep the root that actually contains this path: a companion's own root is
  // derived from it (claude's session-env sits beside the projects dir), so a
  // WSL-home session can never pair with the local host's companion root.
  const matchedRoot = roots
    .map((root) => resolve(root))
    .find((root) => isPathInsideOrEqual(root, resolvedPath))
  if (!matchedRoot) {
    return rejected(agent, 'path-outside-known-roots')
  }

  if (!AI_VAULT_DELETE_TARGET_EXTENSIONS[agent].includes(extname(resolvedPath).toLowerCase())) {
    return rejected(agent, 'invalid-extension')
  }

  const filePredicate = AI_VAULT_DELETE_TARGET_FILE_PREDICATES[agent]
  if (filePredicate && !filePredicate(resolvedPath)) {
    return rejected(agent, 'file-predicate-mismatch')
  }

  const removals = sessionDeleteRemovals({ agent, resolvedPath, matchedRoot, roots })
  if (!removals) {
    return rejected(agent, 'no-session-directory')
  }

  return { allowed: true, agent, resolvedPath, removals }
}

// The ordered path set that removing this session means. Companions
// first, the scanner-surfaced path last — see the ordering note on
// AiVaultSessionDeleteAllowedResult. Returns null when the path names no
// session directory of its own, which would make the removal reach the root
// holding every session instead.
//
// `~/.claude/session-env/<uuid>/` is a companion because it holds that
// session's generated shell exports and nothing else. Its sibling
// `file-history/<uuid>/` deliberately is not: that is the rewind buffer with
// earlier versions of the user's own files, and retiring a session is no
// reason to take away the only copy that can restore them.
function sessionDeleteRemovals(args: {
  agent: AiVaultDeletableAgent
  resolvedPath: string
  matchedRoot: string
  roots: readonly string[]
}): readonly AiVaultSessionDeleteRemoval[] | null {
  const { agent, resolvedPath, matchedRoot, roots } = args
  const resolvedRoots = roots.map((root) => resolve(root))

  if (AI_VAULT_DIRECTORY_SHAPED_DELETE_AGENTS.has(agent)) {
    const sessionDir = dirname(resolvedPath)
    if (sessionDir === matchedRoot || !isPathInsideOrEqual(matchedRoot, sessionDir)) {
      return null
    }
    return [{ path: sessionDir, kind: 'directory', roots: resolvedRoots }]
  }

  if (agent === 'claude') {
    const sessionId = basename(resolvedPath, extname(resolvedPath))
    // A degenerate stem ('.' from `..jsonl`, or empty) would resolve the
    // session directory to the project directory and trash every session in it.
    if (!sessionId || sessionId === '.' || sessionId === '..') {
      return null
    }
    // <enc>/<uuid>/, the directory named after the transcript. It holds
    // `subagents/` today; taking the parent rather than that one subdirectory
    // is what keeps an empty <uuid>/ from being left behind on every delete.
    // Derived from the scanner's own subagents path so the two can't drift.
    const sessionDir = dirname(subagentTranscriptsDirFor(resolvedPath))
    // <home>/.claude/projects -> <home>/.claude/session-env, so a WSL-home
    // session cleans up that distro's session-env, not the local host's.
    const sessionEnvRoot = join(dirname(matchedRoot), 'session-env')
    return [
      { path: sessionDir, kind: 'directory', roots: resolvedRoots },
      { path: join(sessionEnvRoot, sessionId), kind: 'directory', roots: [sessionEnvRoot] },
      { path: resolvedPath, kind: 'file', roots: resolvedRoots }
    ]
  }

  return [{ path: resolvedPath, kind: 'file', roots: resolvedRoots }]
}

function rejected(
  agent: AiVaultAgent,
  reason: AiVaultSessionDeleteRejectionCode
): AiVaultSessionDeleteValidationResult {
  return { allowed: false, agent, reason }
}

function pathSegments(filePath: string): string[] {
  return filePath.split(/[\\/]/)
}
