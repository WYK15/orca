import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  normalizeDesktopAppearance,
  type DesktopAppearance
} from '../../../../shared/desktop-appearance'

let pendingPatch: Partial<DesktopAppearance> = {}
let pendingSave: Promise<void> | null = null

export function updateDesktopAppearance(patch: Partial<DesktopAppearance>): Promise<void> {
  pendingPatch = { ...pendingPatch, ...patch }
  pendingSave ??= Promise.resolve().then(async () => {
    try {
      while (Object.keys(pendingPatch).length) {
        const next = pendingPatch
        pendingPatch = {}
        const state = useAppStore.getState()
        try {
          await state.updateSettingsOrThrow({
            desktopAppearance: {
              ...normalizeDesktopAppearance(state.settings?.desktopAppearance),
              ...next
            }
          })
        } catch (error) {
          toast.error(
            translate('fork.appearance.saveFailed', 'Could not save appearance settings.'),
            {
              description: error instanceof Error ? error.message : String(error)
            }
          )
        }
      }
    } finally {
      pendingSave = null
    }
  })
  return pendingSave
}
