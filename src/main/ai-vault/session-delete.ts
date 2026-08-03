import { lstat, realpath } from 'node:fs/promises'
import { shell } from 'electron'
import type {
  AiVaultDeleteSessionResult,
  AiVaultSessionDeleteRemoval
} from '../../shared/ai-vault-session-deletion'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import {
  validateAiVaultSessionDeleteTarget,
  type ValidateAiVaultSessionDeleteTargetArgs
} from './session-delete-target'
import { tryDeleteWslUncPath } from '../wsl-unc-delete'
import { isENOENT } from '../ipc/filesystem-auth'

// Moved to shared/ai-vault-types.ts: the IPC handler and the renderer
// both need this exact shape, and main-only files aren't importable there.
export type AiVaultSessionDeleteExecutionResult = AiVaultDeleteSessionResult

// Removes a supported AI Vault session for real: every path in the
// validated removal plan, companions first and the session's own transcript
// last, so a failure part-way leaves the session's row on screen to retry from
// instead of dropping the row and stranding the rest on disk.
// Never throws: IPC payloads are untyped at runtime, so both a rejected
// input and an unexpected fs error resolve to a discriminated result the
// caller (the IPC handler) can render instead of a crash.
export async function deleteAiVaultSessionFile(
  args: ValidateAiVaultSessionDeleteTargetArgs
): Promise<AiVaultSessionDeleteExecutionResult> {
  const validation = validateAiVaultSessionDeleteTarget(args)
  if (!validation.allowed) {
    return { outcome: 'rejected', agent: validation.agent, reason: validation.reason }
  }
  const { agent, removals } = validation

  try {
    for (const removal of removals) {
      const rejection = await removeOne(removal)
      if (rejection) {
        return { outcome: 'rejected', agent, reason: rejection }
      }
    }
    return { outcome: 'deleted' }
  } catch (error) {
    return {
      outcome: 'failed',
      agent,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// Trash one planned path, or return the rejection code that stops the whole
// plan. A missing path is success at every step: companions are optional (a
// session that never spawned a subagent has no subagents dir) and an already
// externally-deleted transcript must stay idempotent.
async function removeOne(
  removal: AiVaultSessionDeleteRemoval
): Promise<'unexpected-target-kind' | 'path-outside-known-roots' | null> {
  // Why this order: a WSL UNC path can't be lstat/realpath-guarded with
  // Windows-local semantics (the 9P filesystem's stat is unreliable) and
  // shell.trashItem can't trash it (the WSL volume has no Recycle Bin), so try
  // the WSL rm branch (its own idempotent `rm -f`/`-rf`, which never follows a
  // symlink) before the fs guards below, and only fall through to
  // lstat/realpath/trashItem for a non-WSL path. Directory removals — claude's
  // subagents/session-env dirs and rovo/grok's session dir — must pass through
  // here too (recursive), or on Windows they'd hit shell.trashItem and fail (or
  // be silently stranded by a false-ENOENT lstat).
  if (await tryDeleteWslUncPath(removal.path, { recursive: removal.kind === 'directory' })) {
    return null
  }

  let stats
  try {
    stats = await lstat(removal.path)
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
  // lstat (not stat) so a symlink is caught here rather than dereferenced.
  const kindMatches = removal.kind === 'file' ? stats.isFile() : stats.isDirectory()
  if (!kindMatches) {
    return 'unexpected-target-kind'
  }

  let realResolvedPath: string
  try {
    realResolvedPath = await realpath(removal.path)
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
  // Catches a path reached through a symlinked parent directory that escapes
  // the agent's roots, which lstat() on the leaf can't see. The roots are only
  // resolve()'d (text, no symlink following), so realpath them too before
  // comparing — otherwise a legit session under a symlinked root (e.g.
  // ~/.claude -> /Volumes/data/.claude) is falsely rejected. A root that can't
  // be realpath'd (a WSL root absent on this host) falls back to its text form.
  if (realResolvedPath !== removal.path) {
    const realRoots = await Promise.all(
      removal.roots.map((root) => realpath(root).catch(() => root))
    )
    if (!realRoots.some((root) => isPathInsideOrEqual(root, realResolvedPath))) {
      return 'path-outside-known-roots'
    }
  }

  try {
    await shell.trashItem(removal.path)
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
  return null
}
