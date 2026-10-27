import { expect, it } from 'vitest'

export function registerTauriPersonalDesktopSettingsTest(scope) {
  it('keeps removed features and remote routing disabled after settings updates and restart', async () => {
    const { call, stopHost, startHost } = scope()
    const disabled = {
      experimentalPet: false,
      experimentalActivity: false,
      experimentalAgentDashboardPopout: false,
      experimentalAgentHibernation: false,
      experimentalNativeChat: false,
      experimentalEphemeralVms: false,
      experimentalNewWorktreeCardStyle: false,
      floatingTerminalEnabled: false,
      openAgentTabsInChatByDefault: false,
      activeRuntimeEnvironmentId: null
    }
    await call('settings:set', [
      {
        ...Object.fromEntries(Object.keys(disabled).map((key) => [key, true])),
        activeRuntimeEnvironmentId: 'legacy-server'
      }
    ])
    expect(await call('settings:get')).toMatchObject(disabled)
    expect((await call('runtime:getStatus')).floatingWorkspaceEnabled).toBe(false)
    await stopHost()
    await startHost()
    expect(await call('settings:get')).toMatchObject(disabled)
    expect((await call('runtime:getStatus')).floatingWorkspaceEnabled).toBe(false)
  })
}
