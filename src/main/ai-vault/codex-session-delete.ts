import type { Dirent } from 'node:fs'
import { lstat, realpath, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import type {
  AiVaultDeleteSessionArgs,
  AiVaultDeleteSessionResult,
  AiVaultSessionDeleteRejectionCode
} from '../../shared/ai-vault-session-deletion'
import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '../../shared/execution-host'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { isWslUncPath } from '../../shared/wsl-paths'
import { getSystemCodexHomePath, resolveOrcaManagedCodexHomePath } from '../codex/codex-home-paths'
import { asRecord, parseJsonObject, extractString } from './session-scanner-values'

const CODEX_SESSION_INDEX_FILE = 'session_index.jsonl'
export type CodexSessionDeleteDeps = {
  defaultCodexHome?: string
  managedCodexHome?: string
  additionalCodexHomePaths?: readonly string[]
  trashItem?: (path: string) => Promise<void>
  writeIndexAtomically?: (path: string, content: string) => Promise<void>
  onDeleted?: (paths: string[], homes: string[]) => void
}
class CodexDeletionRejection extends Error {
  constructor(readonly reason: AiVaultSessionDeleteRejectionCode) {
    super(reason)
  }
}

// Codex has aliases across known homes and a shared index; the generic file
// executor deliberately remains unavailable for Codex.
export async function deleteCodexAiVaultSession(
  args: AiVaultDeleteSessionArgs | undefined,
  deps: CodexSessionDeleteDeps = {}
): Promise<AiVaultDeleteSessionResult> {
  if (!args) {
    return rejected('invalid-path')
  }
  if (args.agent !== 'codex') {
    return rejected('unsupported-agent')
  }
  if (
    normalizeExecutionHostId(args.executionHostId) !== LOCAL_EXECUTION_HOST_ID ||
    (typeof args.filePath === 'string' && isWslUncPath(args.filePath))
  ) {
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
  const homes = codexHomesForAiVaultDeletion(args, deps)
  const selectedPath = resolve(args.filePath)
  const selectedRoot = homes
    .map((home) => join(home, 'sessions'))
    .find((root) => isPathInsideOrEqual(root, selectedPath))
  if (!selectedRoot) {
    return rejected('path-outside-known-roots')
  }
  try {
    await assertRegularFileInside(selectedPath, selectedRoot)
    const transcriptPaths = (
      await Promise.all(homes.map((home) => findAliases(join(home, 'sessions'), args.sessionId!)))
    ).flat()
    if (!transcriptPaths.includes(selectedPath)) {
      return rejected('file-predicate-mismatch')
    }
    const updates = (
      await Promise.all(homes.map((home) => filterIndex(home, args.sessionId!)))
    ).filter((update) => update !== null)
    // Index changes precede transcripts: a failed index write leaves the
    // conversation visible and retryable, rather than a dangling registry row.
    for (const update of updates) {
      await assertRegularFileInside(update.path, dirname(update.path))
      await (deps.writeIndexAtomically ?? writeIndexAtomically)(update.path, update.content)
    }
    for (const path of transcriptPaths) {
      const root = homes
        .map((home) => join(home, 'sessions'))
        .find((root) => isPathInsideOrEqual(root, path))!
      await assertRegularFileInside(path, root)
      await (deps.trashItem ?? shell.trashItem)(path)
    }
    deps.onDeleted?.(transcriptPaths, homes)
    return { outcome: 'deleted' }
  } catch (error) {
    if (error instanceof CodexDeletionRejection) {
      return rejected(error.reason)
    }
    return {
      outcome: 'failed',
      agent: 'codex',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function codexHomesForAiVaultDeletion(
  _args: AiVaultDeleteSessionArgs,
  deps: CodexSessionDeleteDeps
): string[] {
  // Renderer codexHome is only a hint, never an authority to allowlist a path.
  return [
    ...new Set(
      [
        deps.defaultCodexHome ?? getSystemCodexHomePath(),
        process.env.CODEX_HOME?.trim(),
        deps.managedCodexHome ?? resolveOrcaManagedCodexHomePath(),
        ...(deps.additionalCodexHomePaths ?? [])
      ]
        .filter((home): home is string => Boolean(home) && !isWslUncPath(home!))
        .map((home) => resolve(home))
    )
  ]
}

async function assertRegularFileInside(path: string, root: string): Promise<void> {
  if (!(await lstat(path)).isFile()) {
    throw new CodexDeletionRejection('unexpected-target-kind')
  }
  const [actualPath, actualRoot] = await Promise.all([realpath(path), realpath(root)])
  if (!isPathInsideOrEqual(actualRoot, actualPath)) {
    throw new CodexDeletionRejection('path-outside-known-roots')
  }
}

async function findAliases(root: string, sessionId: string): Promise<string[]> {
  const paths: string[] = []
  await walk(root, async (path) => {
    if (extname(path).toLowerCase() !== '.jsonl') {
      return
    }
    await assertRegularFileInside(path, root)
    const content = await readFile(path, 'utf8')
    if (
      content.split(/\r?\n/).some((line) => {
        const record = parseJsonObject(line)
        const payload = record ? asRecord(record.payload) : null
        return record?.type === 'session_meta' && payload && extractString(payload.id) === sessionId
      })
    ) {
      paths.push(path)
    }
  })
  return paths
}
async function walk(root: string, visit: (path: string) => Promise<void>): Promise<void> {
  let entries: Dirent[]
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
      await walk(path, visit)
    } else if (entry.isFile()) {
      await visit(path)
    }
  }
}
async function filterIndex(
  home: string,
  sessionId: string
): Promise<{ path: string; content: string } | null> {
  const path = join(home, CODEX_SESSION_INDEX_FILE)
  let content: string
  try {
    await assertRegularFileInside(path, home)
    content = await readFile(path, 'utf8')
  } catch (error) {
    if (isEnoent(error)) {
      return null
    }
    throw error
  }
  const lines = content.split(/\r?\n/)
  const filtered = lines.filter((line) => extractString(parseJsonObject(line)?.id) !== sessionId)
  if (filtered.length === lines.length) {
    return null
  }
  return {
    path,
    content: filtered.filter(Boolean).join('\n') + (content.endsWith('\n') ? '\n' : '')
  }
}
async function writeIndexAtomically(path: string, content: string): Promise<void> {
  const temporaryPath = join(dirname(path), `.${CODEX_SESSION_INDEX_FILE}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}
function rejected(reason: AiVaultSessionDeleteRejectionCode) {
  return { outcome: 'rejected' as const, agent: 'codex' as const, reason }
}
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}
