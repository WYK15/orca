import { readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import type {
  AiVaultDeleteSessionArgs,
  AiVaultDeleteSessionResult
} from '../../shared/ai-vault-session-deletion'
import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '../../shared/execution-host'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { isWslUncPath } from '../../shared/wsl-paths'
import { getSystemCodexHomePath, resolveOrcaManagedCodexHomePath } from '../codex/codex-home-paths'
import { CONFIGURED_CODEX_HOME_DIR } from './session-scanner-source-discovery'
import { asRecord, parseJsonObject, extractString } from './session-scanner-values'

const CODEX_SESSION_INDEX_FILE = 'session_index.jsonl'

export type CodexSessionDeleteDeps = {
  defaultCodexHome?: string
  managedCodexHome?: string
  additionalCodexHomePaths?: readonly string[]
  trashItem?: (path: string) => Promise<void>
  writeIndexAtomically?: (path: string, content: string) => Promise<void>
}

type CodexDeletionPlan = {
  transcriptPaths: string[]
  indexUpdates: { path: string; content: string }[]
}

export async function deleteCodexAiVaultSession(
  args: AiVaultDeleteSessionArgs | undefined,
  deps: CodexSessionDeleteDeps = {}
): Promise<AiVaultDeleteSessionResult> {
  if (!args) {
    return rejected('invalid-path')
  }
  const rejection = validateArgs(args)
  if (rejection) {
    return rejection
  }
  const homes = codexHomesForAiVaultDeletion(args, deps)
  const selectedPath = resolve(args.filePath)
  if (!homes.some((home) => isPathInsideOrEqual(join(home, 'sessions'), selectedPath))) {
    return rejected('path-outside-known-roots')
  }

  try {
    const plan = await createDeletionPlan(args.sessionId!, homes)
    if (!plan.transcriptPaths.includes(selectedPath)) {
      return rejected('file-predicate-mismatch')
    }
    const writeIndex = deps.writeIndexAtomically ?? writeCodexIndexAtomically
    for (const update of plan.indexUpdates) {
      await writeIndex(update.path, update.content)
    }
    const trashItem = deps.trashItem ?? shell.trashItem
    for (const path of plan.transcriptPaths) {
      await trashItem(path)
    }
    return { outcome: 'deleted' }
  } catch (error) {
    return { outcome: 'failed', agent: 'codex', error: errorMessage(error) }
  }
}

function validateArgs(
  args: AiVaultDeleteSessionArgs | undefined
): Extract<AiVaultDeleteSessionResult, { outcome: 'rejected' }> | null {
  if (args?.agent !== 'codex') {
    return rejected('unsupported-agent')
  }
  if (normalizeExecutionHostId(args.executionHostId) !== LOCAL_EXECUTION_HOST_ID) {
    return rejected('non-local-host')
  }
  if (typeof args.filePath === 'string' && isWslUncPath(args.filePath)) {
    return rejected('non-local-host')
  }
  if (
    typeof args.filePath !== 'string' ||
    !args.filePath.trim() ||
    extname(args.filePath).toLowerCase() !== '.jsonl' ||
    typeof args.sessionId !== 'string' ||
    !args.sessionId.trim()
  ) {
    return rejected('invalid-path')
  }
  return null
}

export function codexHomesForAiVaultDeletion(
  args: AiVaultDeleteSessionArgs,
  deps: CodexSessionDeleteDeps
): string[] {
  const homes = [
    deps.defaultCodexHome ?? getSystemCodexHomePath(),
    CONFIGURED_CODEX_HOME_DIR,
    deps.managedCodexHome ?? resolveOrcaManagedCodexHomePath(),
    ...(deps.additionalCodexHomePaths ?? [])
  ]
  const known = new Map<string, string>()
  for (const home of homes) {
    if (!home || isWslUncPath(home)) {
      continue
    }
    known.set(resolve(home), resolve(home))
  }
  if (args.codexHome && known.has(resolve(args.codexHome))) {
    known.set(resolve(args.codexHome), resolve(args.codexHome))
  }
  return [...known.values()]
}

async function createDeletionPlan(
  sessionId: string,
  homes: readonly string[]
): Promise<CodexDeletionPlan> {
  const transcriptPaths = (
    await Promise.all(
      homes.map((home) => findCodexTranscriptAliases(join(home, 'sessions'), sessionId))
    )
  ).flat()
  const indexUpdates = (
    await Promise.all(
      homes.map((home) => filterCodexSessionIndex(join(home, CODEX_SESSION_INDEX_FILE), sessionId))
    )
  ).filter((update): update is { path: string; content: string } => update !== null)
  return { transcriptPaths: [...new Set(transcriptPaths)], indexUpdates }
}

async function findCodexTranscriptAliases(root: string, sessionId: string): Promise<string[]> {
  const paths: string[] = []
  await walkCodexSessions(root, async (path) => {
    if (
      extname(path).toLowerCase() === '.jsonl' &&
      (await transcriptHasSessionId(path, sessionId))
    ) {
      paths.push(path)
    }
  })
  return paths
}

async function walkCodexSessions(
  root: string,
  visitFile: (path: string) => Promise<void>
): Promise<void> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) {
      return
    }
    throw error
  }
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      await walkCodexSessions(path, visitFile)
    } else if (entry.isFile()) {
      await visitFile(path)
    }
  }
}

async function transcriptHasSessionId(path: string, sessionId: string): Promise<boolean> {
  const content = await readFile(path, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const record = parseJsonObject(line)
    const payload = record ? asRecord(record.payload) : null
    if (record?.type === 'session_meta' && payload && extractString(payload.id) === sessionId) {
      return true
    }
  }
  return false
}

async function filterCodexSessionIndex(
  path: string,
  sessionId: string
): Promise<{ path: string; content: string } | null> {
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    if (isEnoent(error)) {
      return null
    }
    throw error
  }
  const filteredLines = content
    .split(/\r?\n/)
    .filter((line) => extractString(parseJsonObject(line)?.id) !== sessionId)
  return {
    path,
    content: filteredLines.filter(Boolean).join('\n') + (content.endsWith('\n') ? '\n' : '')
  }
}

async function writeCodexIndexAtomically(path: string, content: string): Promise<void> {
  const temporaryPath = join(dirname(path), `.${CODEX_SESSION_INDEX_FILE}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function rejected(reason: Extract<AiVaultDeleteSessionResult, { outcome: 'rejected' }>['reason']) {
  return { outcome: 'rejected' as const, agent: 'codex' as const, reason }
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
