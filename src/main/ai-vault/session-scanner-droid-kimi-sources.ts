import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'
import { discoverFiles } from './session-scanner-discovery'
import { resolveKimiSessionsDir } from './session-scanner-kimi-paths'
import { sessionRootDirs } from './session-scanner-root-dirs'
import type { AiVaultScanOptions, SessionFileDiscovery } from './session-scanner-types'

const DROID_SESSIONS_DIR = join(homedir(), '.factory', 'sessions')
const DROID_PROJECTS_DIR = join(homedir(), '.factory', 'projects')

// The two roots droid session files are discovered under. Exported so
// session-delete-target.ts checks membership against the same roots the
// scanner walks, instead of re-declaring `.factory/*` and risking drift.
export function droidSessionRootDirs(
  options: Pick<AiVaultScanOptions, 'droidSessionsDir' | 'droidProjectsDir'>,
  wslHomeDirs: readonly string[]
): string[] {
  return [
    ...sessionRootDirs(options.droidSessionsDir ?? DROID_SESSIONS_DIR, wslHomeDirs, [
      '.factory',
      'sessions'
    ]),
    ...sessionRootDirs(options.droidProjectsDir ?? DROID_PROJECTS_DIR, wslHomeDirs, [
      '.factory',
      'projects'
    ])
  ]
}

export function droidDiscoveries(
  options: AiVaultScanOptions,
  wslHomeDirs: readonly string[],
  limit: number,
  issues: AiVaultScanIssue[]
): Promise<SessionFileDiscovery>[] {
  return droidSessionRootDirs(options, wslHomeDirs).map((rootDir) =>
    discoverFiles({ rootDir, limit, agent: 'droid', issues, extensions: ['.jsonl'] })
  )
}

export function kimiDiscoveries(
  options: AiVaultScanOptions,
  wslHomeDirs: readonly string[],
  limit: number,
  issues: AiVaultScanIssue[]
): Promise<SessionFileDiscovery>[] {
  return sessionRootDirs(resolveKimiSessionsDir(options.kimiSessionsDir), wslHomeDirs, [
    '.kimi-code',
    'sessions'
  ]).map((rootDir) =>
    discoverFiles({
      rootDir,
      limit,
      agent: 'kimi',
      issues,
      extensions: ['.json'],
      // Why: each Kimi session is <sessions>/wd_*/session_*/state.json; match
      // only those (not the sibling agents/*/wire.jsonl transcripts).
      filePredicate: (path) =>
        basename(path) === 'state.json' && basename(dirname(path)).startsWith('session_')
    })
  )
}
