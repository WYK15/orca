import { describe, expect, it } from 'vitest'
import { mergeOrcawProfile } from './orcaw-profile-merge'
import { parseOrcawProfileSnapshot } from './orcaw-profile-source'

function snapshot(value: Record<string, unknown> = {}) {
  return parseOrcawProfileSnapshot(
    JSON.stringify({ schemaVersion: 1, repos: [], settings: {}, ui: {}, ...value })
  )
}

describe('Orcaw project/settings compatibility', () => {
  it('remaps archived and pinned project references while merging an overlapping profile', () => {
    const source = snapshot({
      repos: [{ id: 'old', path: '/work/same' }],
      settings: { sidebarProjectArchive: { old: 123 }, sidebarPinnedRepoIds: ['old'] }
    })
    const target = snapshot({
      repos: [
        { id: 'current', path: '/work/same' },
        { id: 'other', path: '/work/other' }
      ],
      settings: { sidebarProjectArchive: { other: 234 }, sidebarPinnedRepoIds: ['other'] }
    })
    const result = mergeOrcawProfile(source, target)
    expect(result.snapshot.settings.sidebarProjectArchive).toEqual({ current: 123, other: 234 })
    expect(result.snapshot.settings.sidebarPinnedRepoIds).toEqual(['other', 'current'])
  })
  it('deduplicates a local project and remaps project, worktree and sidebar references', () => {
    const source = snapshot({
      repos: [
        {
          id: 'old-repo',
          path: '/work/a',
          displayName: 'old',
          hookSettings: { setup: 'old-repo' }
        },
        { id: 'extra', path: '/work/b' }
      ],
      projects: [{ id: 'old-project', sourceRepoIds: ['old-repo'] }],
      projectHostSetups: [
        {
          id: 'old-setup',
          projectId: 'old-project',
          hostId: 'local',
          repoId: 'old-repo',
          path: '/work/a'
        }
      ],
      worktreeMeta: { 'old-repo::/work/a': { title: 'keep exact -> text', repoId: 'old-repo' } },
      ui: {
        manualRepoOrder: ['old-repo', 'extra'],
        sidebarWidth: 310,
        notificationPermissionRequested: true
      },
      settings: {
        terminalFontSize: 18,
        opencodeSessionCookie: 'electron-ciphertext',
        httpProxyUrl: 'old-proxy-ciphertext',
        codexManagedAccounts: [{ id: 'old-account' }]
      },
      workspaceSession: { mustNotImport: 'live-electron-pty' },
      automations: [{ id: 'should-not-run' }]
    })
    const target = snapshot({
      repos: [
        { id: 'tauri-repo', path: '/work/a', displayName: 'current' },
        { id: 'tauri-extra', path: '/work/c' }
      ],
      projects: [{ id: 'tauri-project', sourceRepoIds: ['tauri-repo'] }],
      projectHostSetups: [
        {
          id: 'tauri-setup',
          projectId: 'tauri-project',
          hostId: 'local',
          repoId: 'tauri-repo',
          path: '/work/a'
        }
      ],
      settings: {
        terminalFontSize: 12,
        opencodeSessionCookie: 'tauri-ciphertext',
        httpProxyUrl: '',
        codexManagedAccounts: [{ id: 'current-account' }]
      },
      ui: { notificationPermissionRequested: false },
      workspaceSession: { editorDraft: 'keep draft', pty: 'tauri-pty' },
      automations: [{ id: 'existing-automation' }]
    })
    const result = mergeOrcawProfile(source, target)
    expect(result.importedRepos).toBe(1)
    expect(result.snapshot.repos).toHaveLength(3)
    expect(result.snapshot.repos[0]).toMatchObject({
      id: 'tauri-repo',
      displayName: 'current',
      hookSettings: { setup: 'old-repo' }
    })
    expect(result.snapshot.projects).toEqual([
      { id: 'tauri-project', sourceRepoIds: ['tauri-repo'] }
    ])
    expect(result.snapshot.projectHostSetups).toEqual(target.projectHostSetups)
    expect(result.snapshot.worktreeMeta).toEqual({
      'tauri-repo::/work/a': { title: 'keep exact -> text', repoId: 'tauri-repo' }
    })
    expect(result.snapshot.ui).toMatchObject({
      manualRepoOrder: ['tauri-repo', 'extra'],
      sidebarWidth: 310,
      notificationPermissionRequested: false
    })
    expect(result.snapshot.settings).toMatchObject({
      terminalFontSize: 18,
      opencodeSessionCookie: 'tauri-ciphertext',
      httpProxyUrl: '',
      codexManagedAccounts: [{ id: 'current-account' }]
    })
    expect(result.snapshot.workspaceSession).toEqual(target.workspaceSession)
    expect(result.snapshot.automations).toEqual(target.automations)
    expect(source.repos[0].id).toBe('old-repo')
    expect(target.repos).toHaveLength(2)
  })

  it('keeps completed onboarding and preserves an already completed Tauri setup', () => {
    const source = snapshot({ onboarding: { closedAt: 10, outcome: 'completed' } })
    const fresh = snapshot({ onboarding: { closedAt: null } })
    expect(mergeOrcawProfile(source, fresh).snapshot.onboarding).toEqual(source.onboarding)
    const target = snapshot({ onboarding: { closedAt: 20, outcome: 'dismissed' } })
    expect(mergeOrcawProfile(source, target).snapshot.onboarding).toEqual(target.onboarding)
  })

  it('keeps SSH, runtime and local folders distinct and remaps SSH target ownership', () => {
    const source = snapshot({
      sshTargets: [{ id: 'old-ssh', host: 'remote', username: 'leo', port: 22 }],
      projectGroups: [{ id: 'remote-group', name: 'Remote', connectionId: 'old-ssh' }],
      folderWorkspaces: [
        {
          id: 'remote-folder',
          folderPath: '/work',
          projectGroupId: 'remote-group',
          connectionId: 'old-ssh'
        }
      ],
      repos: [
        {
          id: 'remote-repo',
          path: '/work',
          connectionId: 'old-ssh',
          executionHostId: 'ssh:old-ssh'
        },
        { id: 'runtime-repo', path: '/work', executionHostId: 'runtime:server' }
      ]
    })
    const target = snapshot({
      sshTargets: [{ id: 'tauri-ssh', host: 'remote', username: 'leo', port: 22 }],
      repos: [{ id: 'local-repo', path: '/work' }],
      folderWorkspaces: [{ id: 'local-folder', folderPath: '/work', projectGroupId: 'local-group' }]
    })
    const { snapshot: merged } = mergeOrcawProfile(source, target)
    expect(merged.sshTargets).toEqual(target.sshTargets)
    expect(merged.repos).toHaveLength(3)
    expect(merged.repos[1]).toMatchObject({
      connectionId: 'tauri-ssh',
      executionHostId: 'ssh:tauri-ssh'
    })
    expect(merged.repos[2].executionHostId).toBe('runtime:server')
    expect(merged.folderWorkspaces).toEqual([
      ...(target.folderWorkspaces as unknown[]),
      expect.objectContaining({ connectionId: 'tauri-ssh' })
    ])
  })

  it('reassigns colliding IDs without changing existing Tauri records', () => {
    const source = snapshot({
      repos: [{ id: 'collision', path: '/source' }],
      worktreeMeta: { 'collision::/source': { repoId: 'collision' } }
    })
    const target = snapshot({ repos: [{ id: 'collision', path: '/target' }] })
    const { snapshot: merged } = mergeOrcawProfile(source, target)
    expect(merged.repos[0]).toEqual(target.repos[0])
    expect(merged.repos[1].id).not.toBe('collision')
    expect(Object.keys(merged.worktreeMeta as object)).toEqual([`${merged.repos[1].id}::/source`])
  })

  it('rejects malformed profiles and duplicate IDs without logging JSON contents', () => {
    expect(() => parseOrcawProfileSnapshot('{"password":"private-value" invalid')).toThrow(
      'not valid JSON'
    )
    expect(() => snapshot({ schemaVersion: 999 })).toThrow('Unsupported')
    expect(() => snapshot({ repos: [{ id: 'a' }, { id: 'a' }] })).toThrow('Duplicate')
    expect(() => snapshot({ projects: [{ id: 'p', sourceRepoIds: 'invalid' }] })).toThrow(
      'references'
    )
  })
})
