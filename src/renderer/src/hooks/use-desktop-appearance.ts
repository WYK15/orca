import { useLayoutEffect } from 'react'
import { PERSONAL_DESKTOP_ENABLED } from '../../../shared/fork-feature-policy'
import { desktopAppearanceVariables } from '../../../shared/desktop-appearance'
import type { GlobalSettings } from '../../../shared/types'

export function useDesktopAppearance(settings: GlobalSettings | null): void {
  useLayoutEffect(() => {
    const root = document.documentElement
    if (!PERSONAL_DESKTOP_ENABLED && !settings?.desktopAppearance) {
      delete root.dataset.desktopAppearance
      return
    }
    root.dataset.desktopAppearance = 'custom'
    for (const [key, value] of Object.entries(
      desktopAppearanceVariables(settings?.desktopAppearance)
    )) {
      root.style.setProperty(key, value)
    }
  }, [settings?.desktopAppearance])
}
