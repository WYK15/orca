import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { openHttpLink, registerHttpLinkStoreAccessor } from '../lib/http-link-routing'
import { getCmdJQuickActions } from '../components/cmd-j/quick-actions'
import { createBrowserSlice } from '../store/slices/browser'
import type { AppState } from '../store/types'
import type { WorkspaceSessionState } from '../../../shared/types'
import type * as ForkFeaturePolicy from '../../../shared/fork-feature-policy'
import {
  DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION,
  ONBOARDING_FEATURE_SETUP_IDS
} from '../components/onboarding/onboarding-feature-setup'

vi.mock('../../../shared/fork-feature-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof ForkFeaturePolicy>()),
  EMBEDDED_BROWSER_ENABLED: false
}))

describe('Tauri without embedded browser', () => {
  const openUrl = vi.fn()
  const createBrowserTab = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('window', { api: { shell: { openUrl } } })
    registerHttpLinkStoreAccessor(() => ({
      settings: { openLinksInApp: true, openLinksInAppModifierInverts: true },
      createBrowserTab,
      setActiveWorktree: vi.fn()
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('opens links externally despite saved browser preferences and modifiers', () => {
    openHttpLink('https://example.com', { worktreeId: 'folder:docs' })
    openHttpLink('https://example.com/shift', { worktreeId: 'repo::/docs', modifierHeld: true })
    expect(openUrl).toHaveBeenCalledTimes(2)
    expect(createBrowserTab).not.toHaveBeenCalled()
  })

  it('omits browser setup and command palette actions', () => {
    expect(getCmdJQuickActions().some((action) => action.id === 'new-browser-tab')).toBe(false)
    expect(ONBOARDING_FEATURE_SETUP_IDS).not.toContain('browserUse')
    expect(DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION.browserUse).toBe(false)
  })

  it('does not register or restore browser tabs through legacy store actions', async () => {
    const store = create<AppState>()(
      (...args) =>
        ({
          settings: {},
          ...createBrowserSlice(...args)
        }) as AppState
    )
    store.getState().createBrowserTab('folder:docs', 'https://example.com', {
      sessionProfileId: null,
      browserRuntimeEnvironmentId: null
    })
    await store.getState().openNewBrowserTabInActiveWorkspace('group-1')
    store.getState().hydrateBrowserSession({
      browserTabsByWorktree: { docs: [{ id: 'old-browser' }] }
    } as unknown as WorkspaceSessionState)
    expect(openUrl).toHaveBeenCalledExactlyOnceWith('https://example.com')
    expect(store.getState().browserTabsByWorktree).toEqual({})
    expect(store.getState().browserPagesByWorkspace).toEqual({})
  })
})
