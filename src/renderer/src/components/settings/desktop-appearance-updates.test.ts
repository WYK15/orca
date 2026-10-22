import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/types'
const mocks = vi.hoisted(() => ({
  state: { settings: {} as Partial<GlobalSettings>, updateSettingsOrThrow: vi.fn() },
  error: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
import { updateDesktopAppearance } from './desktop-appearance-updates'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.settings = {}
  mocks.state.updateSettingsOrThrow.mockImplementation(async (updates: Partial<GlobalSettings>) => {
    mocks.state.settings = { ...mocks.state.settings, ...updates }
  })
})

describe('appearance preference saves', () => {
  it('combines rapid changes to different controls before saving', async () => {
    await Promise.all([
      updateDesktopAppearance({ iconSize: 24 }),
      updateDesktopAppearance({ textSize: 16 })
    ])
    expect(mocks.state.settings.desktopAppearance).toEqual({
      iconSize: 24,
      textSize: 16,
      density: 'standard'
    })
    expect(mocks.state.updateSettingsOrThrow).toHaveBeenCalledOnce()
  })
  it('coalesces slider changes during a slow save and retains other updated controls', async () => {
    let finish!: () => void
    const firstSave = new Promise<void>((resolve) => {
      finish = resolve
    })
    mocks.state.updateSettingsOrThrow.mockImplementationOnce(async (updates) => {
      await firstSave
      mocks.state.settings = { ...mocks.state.settings, ...updates }
    })
    const pending = updateDesktopAppearance({ iconSize: 18 })
    await vi.waitFor(() => expect(mocks.state.updateSettingsOrThrow).toHaveBeenCalledOnce())
    void updateDesktopAppearance({ iconSize: 20 })
    void updateDesktopAppearance({ iconSize: 24 })
    void updateDesktopAppearance({ textSize: 16, density: 'spacious' })
    finish()
    await pending
    expect(mocks.state.settings.desktopAppearance).toEqual({
      iconSize: 24,
      textSize: 16,
      density: 'spacious'
    })
    expect(mocks.state.updateSettingsOrThrow).toHaveBeenCalledTimes(2)
  })
  it('reports save failure and permits subsequent changes', async () => {
    mocks.state.updateSettingsOrThrow.mockRejectedValueOnce(new Error('disk full'))
    await updateDesktopAppearance({ iconSize: 24 })
    expect(mocks.state.settings.desktopAppearance).toBeUndefined()
    expect(mocks.error).toHaveBeenCalledOnce()
    await updateDesktopAppearance({ textSize: 16 })
    expect(mocks.state.settings.desktopAppearance?.textSize).toBe(16)
  })
})
