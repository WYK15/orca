import { randomUUID } from 'node:crypto'
import { posix, win32 } from 'node:path'
import { getRepoExecutionHostId } from '../shared/execution-host'
import type { Repo } from '../shared/types'
import {
  profileRecord,
  type ProfileRecord,
  type OrcawProfileSnapshot
} from './orcaw-profile-source'

const CATALOGS = [
  'sshTargets',
  'projectGroups',
  'folderWorkspaces',
  'repos',
  'projects',
  'projectHostSetups'
] as const
const REFERENCES = new Set([
  'repoId',
  'projectId',
  'projectGroupId',
  'parentGroupId',
  'connectionId',
  'hostId',
  'executionHostId',
  'worktreeId',
  'parentWorktreeId',
  'childWorktreeId',
  'workspaceKey',
  'parentWorkspaceKey',
  'childWorkspaceKey'
])
const REFERENCE_LISTS = new Set([
  'sourceRepoIds',
  'manualRepoOrder',
  'filterRepoIds',
  'setupScriptPromptDismissedRepoIds',
  'sidebarPinnedRepoIds'
])
const PRESERVE_SETTINGS = new Set([
  'opencodeSessionCookie',
  'httpProxyUrl',
  'telemetry',
  'codexManagedAccounts',
  'activeCodexManagedAccountId',
  'activeCodexManagedAccountIdsByRuntime',
  'claudeManagedAccounts',
  'activeClaudeManagedAccountId',
  'activeRuntimeEnvironmentId'
])
const PRESERVE_UI = new Set([
  'lastActiveRepoId',
  'lastActiveWorktreeId',
  'activeView',
  'windowBounds',
  'windowMaximized',
  'notificationPermissionRequested',
  'trustedOrcaHooks',
  'acknowledgedAgentsByPaneKey',
  'browserKagiSessionLink',
  'dismissedUpdateVersion',
  'lastUpdateCheckAt'
])

function rows(snapshot: OrcawProfileSnapshot, field: string): ProfileRecord[] {
  const value = snapshot[field]
  return Array.isArray(value) ? (value as ProfileRecord[]) : []
}

function catalogPath(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    return ''
  }
  const normalized = /^[A-Za-z]:[\\/]|^\\\\/.test(value)
    ? win32.normalize(value)
    : posix.normalize(value)
  return normalized.length > 1 ? normalized.replace(/[\\/]$/, '') : normalized
}

function reference(value: string, ids: Map<string, string>): string {
  if (ids.has(value)) {
    return ids.get(value)!
  }
  for (const prefix of ['folder:', 'worktree:']) {
    if (value.startsWith(prefix)) {
      return prefix + reference(value.slice(prefix.length), ids)
    }
  }
  if (value.startsWith('ssh:')) {
    const id = decodeURIComponent(value.slice(4))
    return ids.has(id) ? `ssh:${encodeURIComponent(ids.get(id)!)}` : value
  }
  const separator = value.indexOf('::')
  return separator > 0 && ids.has(value.slice(0, separator))
    ? ids.get(value.slice(0, separator))! + value.slice(separator)
    : value
}

function rewrite(value: unknown, ids: Map<string, string>, field = ''): unknown {
  if (typeof value === 'string') {
    return REFERENCES.has(field) || REFERENCE_LISTS.has(field) ? reference(value, ids) : value
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewrite(entry, ids, field))
  }
  if (!profileRecord(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, rewrite(entry, ids, key)])
  )
}

function identity(field: string, row: ProfileRecord): string {
  const host = getRepoExecutionHostId(row as unknown as Repo)
  switch (field) {
    case 'sshTargets':
      return JSON.stringify([
        row.configHost,
        row.host,
        row.username,
        row.port,
        row.identityFile,
        row.jumpHost,
        row.proxyCommand
      ])
    case 'repos':
      return JSON.stringify([host, catalogPath(row.path)])
    case 'folderWorkspaces':
      return JSON.stringify([host, catalogPath(row.folderPath), row.projectGroupId])
    case 'projectGroups':
      return JSON.stringify([host, row.name, catalogPath(row.parentPath), row.parentGroupId])
    case 'projectHostSetups':
      return JSON.stringify([row.projectId, row.hostId, row.repoId, catalogPath(row.path)])
    default:
      return String(row.id)
  }
}

export function mergeOrcawProfile(
  source: OrcawProfileSnapshot,
  target: OrcawProfileSnapshot
): {
  snapshot: OrcawProfileSnapshot
  importedRepos: number
  importedFolders: number
} {
  const ids = new Map<string, string>()
  const plans = new Map<string, { row: ProfileRecord; existing: number; id: string }[]>()
  for (const field of CATALOGS) {
    const current = rows(target, field)
    const occupied = new Set(current.map((row) => row.id))
    const planned: { row: ProfileRecord; existing: number; id: string }[] = []
    for (const row of rows(source, field)) {
      if (field === 'sshTargets' && row.owner) {
        continue
      }
      const mapped = rewrite(row, ids) as ProfileRecord
      const existing =
        field === 'projects'
          ? current.findIndex(
              (entry) =>
                Array.isArray(mapped.sourceRepoIds) &&
                Array.isArray(entry.sourceRepoIds) &&
                mapped.sourceRepoIds.some((id) => (entry.sourceRepoIds as unknown[]).includes(id))
            )
          : current.findIndex((entry) => identity(field, entry) === identity(field, mapped))
      const id =
        existing >= 0
          ? String(current[existing].id)
          : occupied.has(row.id)
            ? randomUUID()
            : String(row.id)
      const oldId = String(row.id)
      if (ids.has(oldId) && ids.get(oldId) !== id) {
        throw new Error('Ambiguous Orcaw project identifiers')
      }
      ids.set(oldId, id)
      occupied.add(id)
      planned.push({ row, existing, id })
    }
    plans.set(field, planned)
  }
  const snapshot = structuredClone(target)
  for (const field of CATALOGS) {
    const current = structuredClone(rows(target, field))
    for (const plan of plans.get(field)!) {
      const imported: ProfileRecord = { ...(rewrite(plan.row, ids) as ProfileRecord), id: plan.id }
      if (plan.existing >= 0) {
        const existing = current[plan.existing]
        current[plan.existing] = { ...imported, ...existing }
        if (field === 'projects') {
          current[plan.existing].sourceRepoIds = [
            ...new Set([
              ...(imported.sourceRepoIds as string[]),
              ...(existing.sourceRepoIds as string[])
            ])
          ]
        }
      } else {
        current.push(imported)
      }
    }
    snapshot[field] = current
  }
  for (const field of [
    'sparsePresetsByRepo',
    'worktreeMeta',
    'worktreeLineageById',
    'workspaceLineageByChildKey'
  ]) {
    const values = profileRecord(source[field]) ? (source[field] as ProfileRecord) : {}
    snapshot[field] = {
      ...Object.fromEntries(
        Object.entries(values).map(([key, value]) => [reference(key, ids), rewrite(value, ids)])
      ),
      ...(profileRecord(target[field]) ? target[field] : {})
    }
  }
  snapshot.settings = {
    ...target.settings,
    ...Object.fromEntries(
      Object.entries(source.settings).filter(([key]) => !PRESERVE_SETTINGS.has(key))
    )
  }
  if (profileRecord(source.settings.sidebarProjectArchive)) {
    snapshot.settings.sidebarProjectArchive = {
      ...Object.fromEntries(
        Object.entries(source.settings.sidebarProjectArchive).map(([id, value]) => [
          reference(id, ids),
          value
        ])
      ),
      ...(profileRecord(target.settings.sidebarProjectArchive)
        ? target.settings.sidebarProjectArchive
        : {})
    }
  }
  if (Array.isArray(source.settings.sidebarPinnedRepoIds)) {
    snapshot.settings.sidebarPinnedRepoIds = [
      ...new Set([
        ...(Array.isArray(target.settings.sidebarPinnedRepoIds)
          ? target.settings.sidebarPinnedRepoIds
          : []),
        ...source.settings.sidebarPinnedRepoIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => reference(id, ids))
      ])
    ]
  }
  const sourceUi = profileRecord(source.ui) ? source.ui : {}
  snapshot.ui = {
    ...(profileRecord(target.ui) ? target.ui : {}),
    ...(rewrite(
      Object.fromEntries(Object.entries(sourceUi).filter(([key]) => !PRESERVE_UI.has(key))),
      ids
    ) as ProfileRecord)
  }
  if (
    profileRecord(source.onboarding) &&
    Number(source.onboarding.closedAt) > 0 &&
    !(profileRecord(target.onboarding) && Number(target.onboarding.closedAt) > 0)
  ) {
    snapshot.onboarding = structuredClone(source.onboarding)
  }
  return {
    snapshot,
    importedRepos: rows(snapshot, 'repos').length - rows(target, 'repos').length,
    importedFolders:
      rows(snapshot, 'folderWorkspaces').length - rows(target, 'folderWorkspaces').length
  }
}
