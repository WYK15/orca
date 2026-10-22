import { PERSONAL_DESKTOP_ENABLED } from './fork-feature-policy'
import type { GlobalSettings } from './types'

const effectiveSettings = new WeakMap<GlobalSettings, GlobalSettings>()

export function applyPersonalDesktopSettings(settings: GlobalSettings): GlobalSettings {
  if (!PERSONAL_DESKTOP_ENABLED) {
    return settings
  }
  const cached = effectiveSettings.get(settings)
  if (cached) {
    return cached
  }
  const next = {
    ...settings,
    ...Object.fromEntries(
      Object.entries(settings)
        .filter(([key, value]) => key.startsWith('experimental') && typeof value === 'boolean')
        .map(([key]) => [key, false])
    ),
    activeRuntimeEnvironmentId: null,
    openAgentTabsInChatByDefault: false
  }
  effectiveSettings.set(settings, next)
  return next
}
