import { open, readFile, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { readProfileIndex } from '../main/orca-profiles/profile-index-store'

export type ProfileRecord = Record<string, unknown>
export type OrcawProfileSnapshot = ProfileRecord & {
  schemaVersion: number
  repos: ProfileRecord[]
  settings: ProfileRecord
}
export type OrcawProfileSource = {
  file: string
  profileName: string
  snapshot: OrcawProfileSnapshot
}

export function profileRecord(value: unknown): value is ProfileRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseOrcawProfileSnapshot(text: string): OrcawProfileSnapshot {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Orcaw profile is not valid JSON')
  }
  if (
    !profileRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.repos) ||
    !profileRecord(value.settings)
  ) {
    throw new Error('Unsupported Orcaw profile format')
  }
  for (const field of [
    'repos',
    'projects',
    'projectHostSetups',
    'projectGroups',
    'folderWorkspaces',
    'sshTargets'
  ]) {
    const rows = value[field]
    if (
      rows !== undefined &&
      (!Array.isArray(rows) ||
        rows.some((row) => !profileRecord(row) || typeof row.id !== 'string' || !row.id))
    ) {
      throw new Error(`Invalid Orcaw project catalog: ${field}`)
    }
    if (Array.isArray(rows) && new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new Error(`Duplicate Orcaw project identifiers: ${field}`)
    }
  }
  if (
    Array.isArray(value.projects) &&
    value.projects.some(
      (row: ProfileRecord) =>
        !Array.isArray(row.sourceRepoIds) || row.sourceRepoIds.some((id) => typeof id !== 'string')
    )
  ) {
    throw new Error('Invalid Orcaw project repository references')
  }
  return value as OrcawProfileSnapshot
}

export async function readOrcawProfile(file: string): Promise<OrcawProfileSnapshot> {
  const handle = await open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) {
      throw new Error('Orcaw profile exceeds the import size limit')
    }
    return parseOrcawProfileSnapshot(await handle.readFile('utf8'))
  } finally {
    await handle.close()
  }
}

export async function findOrcawProfile(directory: string): Promise<OrcawProfileSource | null> {
  let root: string
  try {
    root = await realpath(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
  const indexPath = join(root, 'orca-profile-index.json')
  const index = readProfileIndex(indexPath)
  let file = join(root, 'orca-data.json')
  let profileName = 'Orcaw'
  if (index) {
    const profile = index.profiles.find((entry) => entry.id === index.activeProfileId)!
    file = join(root, 'profiles', profile.id, 'orca-data.json')
    profileName = profile.name.slice(0, 80)
  } else {
    try {
      await readFile(indexPath)
      throw new Error('Orcaw profile index is corrupt')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  try {
    const actual = await realpath(file)
    const pathWithinRoot = relative(root, actual)
    if (pathWithinRoot.startsWith('..') || isAbsolute(pathWithinRoot)) {
      throw new Error('Orcaw profile is outside its data directory')
    }
    return { file: actual, profileName, snapshot: await readOrcawProfile(actual) }
  } catch (error) {
    if (!index && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}
