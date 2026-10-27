// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  keybindingSnapshot: { path: '/fixture/keybindings.json' },
  ensureKeybindingsFile: vi.fn(),
  openKeybindingsFile: vi.fn().mockResolvedValue(undefined),
  revealKeybindingsFile: vi.fn(),
  reloadKeybindings: vi.fn(),
  openFiles: [],
  openFile: vi.fn(),
  closeFile: vi.fn(),
  updateSettings: vi.fn(),
  settings: { floatingTerminalEnabled: true }
}))
vi.mock('../../store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, text: string) => text }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.clearAllMocks()
})

it('opens shortcut configuration externally without reactivating the removed workspace', async () => {
  vi.stubGlobal('ORCA_PERSONAL_DESKTOP_ENABLED', true)
  const { KeybindingsFileActions } = await import('./KeybindingsFileActions')
  render(<KeybindingsFileActions />)

  fireEvent.click(screen.getByRole('button', { name: 'Open with Default App' }))
  await waitFor(() => expect(state.openKeybindingsFile).toHaveBeenCalledExactlyOnceWith())
  expect(state.updateSettings).not.toHaveBeenCalled()
  expect(state.openFile).not.toHaveBeenCalled()
  expect(state.ensureKeybindingsFile).not.toHaveBeenCalled()
})
