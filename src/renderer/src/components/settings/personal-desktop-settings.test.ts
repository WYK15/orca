import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('personal desktop settings', () => {
  it('keeps the local host selected despite legacy remote ownership preferences', async () => {
    vi.stubGlobal('ORCA_PERSONAL_DESKTOP_ENABLED', true)
    vi.resetModules()
    const { getActiveRuntimeTarget } = await import('../../runtime/runtime-client-target')
    const { getSettingsFocusedExecutionHostId } = await import('../../../../shared/execution-host')
    const { buildExecutionHostRegistry } =
      await import('../../../../shared/execution-host-registry')
    const settings = { activeRuntimeEnvironmentId: 'old-server' }
    expect(getActiveRuntimeTarget(settings)).toEqual({ kind: 'local' })
    expect(getSettingsFocusedExecutionHostId(settings)).toBe('local')
    expect(
      buildExecutionHostRegistry({
        settings,
        repos: [{ connectionId: 'old-ssh' }, { executionHostId: 'runtime:old-server' }],
        sshTargetLabels: new Map([['old-ssh', 'Old SSH']]),
        runtimeEnvironments: [{ id: 'old-server', name: 'Old server' }]
      }).map((host) => host.id)
    ).toEqual(['local'])
  })
  it('removes disabled settings from navigation and search', async () => {
    vi.stubGlobal('ORCA_PERSONAL_DESKTOP_ENABLED', true)
    vi.resetModules()
    const { buildSettingsNavigationMetadata } =
      await import('../../hooks/useSettingsNavigationMetadata')
    const sections = buildSettingsNavigationMetadata({
      isMac: true,
      isWindows: false,
      isWebClient: false,
      isLinearConnected: true,
      repos: []
    })
    const ids = sections.map((section) => section.id)
    for (const id of [
      'plugins',
      'setup-guide',
      'linear',
      'mobile-emulator',
      'orchestration',
      'servers',
      'ssh',
      'experimental'
    ]) {
      expect(ids).not.toContain(id)
    }
    const { getIntegrationsPaneSearchEntries } = await import('./integrations-search')
    expect(
      getIntegrationsPaneSearchEntries().some((entry) => /linear|jira/i.test(entry.title))
    ).toBe(false)
    const { getAppearancePaneSearchEntries } = await import('./appearance-search')
    expect(
      getAppearancePaneSearchEntries().some((entry) => /show automations button/i.test(entry.title))
    ).toBe(false)
    const { groupDefinitions } = await import('./shortcut-groups')
    expect(
      groupDefinitions([])
        .flatMap((group) => group.items)
        .some((item) => item.id === 'tab.newSimulator' || item.id === 'workspace.openBoard')
    ).toBe(false)
    const { getShortcutsPaneSearchEntries } = await import('./shortcuts-search')
    expect(
      getShortcutsPaneSearchEntries().some((entry) => /workspace board/i.test(entry.title))
    ).toBe(false)
    expect(getShortcutsPaneSearchEntries().some((entry) => /emulator/i.test(entry.title))).toBe(
      false
    )
  })
})
