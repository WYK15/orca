import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('personal Tauri feature policy', () => {
  it('retains upstream features in builds without the personal desktop flag', async () => {
    vi.stubGlobal('ORCA_PERSONAL_DESKTOP_ENABLED', undefined)
    vi.resetModules()
    const policy = await import('./fork-feature-policy')
    expect(policy.PERSONAL_DESKTOP_ENABLED).toBe(false)
    expect(policy.AUTOMATIONS_ENABLED).toBe(true)
    expect(policy.ORCA_PLUGINS_ENABLED).toBe(true)
    expect(policy.FLOATING_WORKSPACE_ENABLED).toBe(true)
  })
  it('excludes optional integrations from personal builds and their task provider choices', async () => {
    vi.stubGlobal('ORCA_PERSONAL_DESKTOP_ENABLED', true)
    vi.resetModules()
    const policy = await import('./fork-feature-policy')
    for (const flag of [
      policy.AUTOMATIONS_ENABLED,
      policy.ORCA_PLUGINS_ENABLED,
      policy.ISSUE_TRACKERS_ENABLED,
      policy.SIMULATOR_ENABLED,
      policy.ONBOARDING_ENABLED,
      policy.REMOTE_HOSTS_ENABLED,
      policy.ORCHESTRATION_ENABLED,
      policy.EXPERIMENTAL_FEATURES_ENABLED,
      policy.WORKSPACE_BOARD_ENABLED,
      policy.FLOATING_WORKSPACE_ENABLED
    ]) {
      expect(flag).toBe(false)
    }
    const providers = await import('./task-providers')
    expect(providers.TASK_PROVIDERS).toEqual(['github', 'gitlab'])
    expect(providers.isTaskProvider('linear')).toBe(true)
    expect(
      providers.normalizeTaskProviderSettings({
        visibleTaskProviders: ['linear', 'jira'],
        defaultTaskSource: 'linear'
      })
    ).toEqual({ visibleTaskProviders: ['github', 'gitlab'], defaultTaskSource: 'github' })
    expect(
      providers.filterAvailableTaskProviders(['github', 'gitlab', 'linear', 'jira'], {
        gitlabInstalled: true,
        linearConnected: true
      })
    ).toEqual(['github', 'gitlab'])
    expect(
      providers.restoreAvailableDefaultTaskProvider(
        ['github'],
        { gitlabInstalled: true, linearConnected: true },
        'linear'
      )
    ).toEqual(['github'])
  })
})
