import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import {
  getAiVaultWslHomeDirs,
  invalidateAiVaultSessionListCache
} from '../ai-vault/cached-session-list'
import { deleteAiVaultSessionFile } from '../ai-vault/session-delete'
import { invalidateSessionParseCacheEntry } from '../ai-vault/session-scanner-parse-cache'
import type {
  AiVaultAgent,
  AiVaultDeleteSessionArgs,
  AiVaultDeleteSessionResult
} from '../../shared/ai-vault-types'

// The multi-host scan-result cache is private module state in ai-vault.ts, so
// its invalidation is injected rather than reached into from here.
type AiVaultDeleteDeps = {
  invalidateMultiHostListCache: () => void
}

// Registers the IPC channel, binding the delete orchestration to the caller's
// cache-invalidation seam.
export function registerAiVaultDeleteHandler(deps: AiVaultDeleteDeps): void {
  ipcMain.handle('aiVault:deleteSession', (_event, args?: AiVaultDeleteSessionArgs) =>
    deleteAiVaultSession(args, deps)
  )
}

// Delegates the trash + re-validation to the executor; this
// only adapts the untyped IPC payload and, on a real delete, invalidates the
// caches that could otherwise still serve the deleted session for up to the
// scan cache TTL.
export async function deleteAiVaultSession(
  args: AiVaultDeleteSessionArgs | undefined,
  deps: AiVaultDeleteDeps
): Promise<AiVaultDeleteSessionResult> {
  // deleteAiVaultSessionFile's validator tolerates a malformed agent/filePath
  // (it never throws) but destructures `args`, so an entirely missing payload
  // is defaulted to an empty shape here to keep the never-throws boundary.
  const wslHomeDirs = await getAiVaultWslHomeDirs()
  const result = await deleteAiVaultSessionFile({
    agent: args?.agent as AiVaultAgent,
    filePath: args?.filePath ?? '',
    executionHostId: args?.executionHostId,
    wslHomeDirs
  })

  if (result.outcome === 'deleted') {
    // Three caches can otherwise resurrect the deleted session for up to the
    // scan cache TTL: ai-vault.ts's multi-host scan-result cache, the shared
    // local-scope scan-result cache (also used by the runtime/mobile path),
    // and the per-file parse cache entry (cleanliness, not correctness — scan
    // discovery walks disk first, so a trashed file is never rediscovered).
    deps.invalidateMultiHostListCache()
    invalidateAiVaultSessionListCache()
    invalidateSessionParseCacheEntry(resolve(args?.filePath ?? ''))
  }

  return result
}
