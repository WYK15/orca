import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from './constants'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('personal desktop settings', () => {
  it('retains upstream settings outside personal builds', async () => {
    vi.stubGlobal('ORCA_PERSONAL_DESKTOP_ENABLED', undefined)
    vi.resetModules()
    const { applyPersonalDesktopSettings } = await import('./personal-desktop-settings')
    const settings = {
      ...getDefaultSettings('/fixture'),
      experimentalPet: true,
      activeRuntimeEnvironmentId: 'server'
    }
    expect(applyPersonalDesktopSettings(settings)).toBe(settings)
  })

  it('ignores legacy remote and experimental enablement without modifying stored records', async () => {
    vi.stubGlobal('ORCA_PERSONAL_DESKTOP_ENABLED', true)
    vi.resetModules()
    const { applyPersonalDesktopSettings } = await import('./personal-desktop-settings')
    const settings = {
      ...getDefaultSettings('/fixture'),
      activeRuntimeEnvironmentId: 'server',
      experimentalPet: true,
      experimentalActivity: true,
      experimentalAgentDashboardPopout: true,
      experimentalNativeChat: true,
      experimentalAgentHibernation: true,
      experimentalTerminalAttention: true,
      experimentalEphemeralVms: true,
      experimentalNewWorktreeCardStyle: true,
      openAgentTabsInChatByDefault: true,
      desktopAppearance: { iconSize: 24, textSize: 16, density: 'spacious' as const }
    }
    const effective = applyPersonalDesktopSettings(settings)
    expect(effective.activeRuntimeEnvironmentId).toBeNull()
    expect(effective.openAgentTabsInChatByDefault).toBe(false)
    for (const [key, value] of Object.entries(effective)) {
      if (key.startsWith('experimental') && typeof value === 'boolean') {
        expect(value).toBe(false)
      }
    }
    expect(effective.desktopAppearance).toEqual(settings.desktopAppearance)
    expect(settings.experimentalPet).toBe(true)
    expect(settings.activeRuntimeEnvironmentId).toBe('server')
    expect(applyPersonalDesktopSettings(settings)).toBe(effective)
  })
})
