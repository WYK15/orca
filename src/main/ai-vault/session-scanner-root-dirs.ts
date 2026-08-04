import { join } from 'node:path'

// Single source of truth for how an agent's host root expands into the local
// host root plus one per WSL distro home. Both the scanner
// (session-scanner-source-discovery.ts, session-scanner-droid-kimi-sources.ts)
// and the deletion validator (session-delete-target.ts) import this, so a
// deletion root can never drift from the scanner's own root construction.
export function sessionRootDirs(
  hostRootDir: string,
  wslHomeDirs: readonly string[],
  segments: readonly string[]
): string[] {
  return [hostRootDir, ...wslHomeDirs.map((homeDir) => join(homeDir, ...segments))]
}
