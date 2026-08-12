import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { RemoteSessionCandidate } from './remote-session-scanner-types'

const MAX_REMOTE_PARSE_CACHE_ENTRIES = 4096

type RemoteSessionParseCacheEntry = {
  mtimeMs: number
  sizeBytes: number | undefined
  subagentTranscriptCount: number | undefined
  session: AiVaultSession | null
}

const cache = new Map<string, RemoteSessionParseCacheEntry>()

function cacheKey(candidate: RemoteSessionCandidate, executionHostId: string): string {
  return `${executionHostId}\0${candidate.source.agent}\0${candidate.source.codexHome ?? ''}\0${candidate.file.path}`
}

function storeEntry(key: string, entry: RemoteSessionParseCacheEntry): void {
  cache.delete(key)
  cache.set(key, entry)
  if (cache.size > MAX_REMOTE_PARSE_CACHE_ENTRIES) {
    const oldest = cache.keys().next()
    if (!oldest.done) {
      cache.delete(oldest.value)
    }
  }
}

export async function parseRemoteSessionCandidateCached(args: {
  candidate: RemoteSessionCandidate
  executionHostId: string
  parse: () => Promise<AiVaultSession | null>
}): Promise<AiVaultSession | null> {
  const key = cacheKey(args.candidate, args.executionHostId)
  const cached = cache.get(key)
  if (
    cached?.mtimeMs === args.candidate.file.mtimeMs &&
    cached.sizeBytes === args.candidate.file.sizeBytes &&
    cached.subagentTranscriptCount === args.candidate.subagentTranscriptCount
  ) {
    storeEntry(key, cached)
    return cached.session
  }
  const session = await args.parse()
  storeEntry(key, {
    mtimeMs: args.candidate.file.mtimeMs,
    sizeBytes: args.candidate.file.sizeBytes,
    subagentTranscriptCount: args.candidate.subagentTranscriptCount,
    session
  })
  return session
}

export function resetRemoteSessionParseCacheForTests(): void {
  cache.clear()
}
