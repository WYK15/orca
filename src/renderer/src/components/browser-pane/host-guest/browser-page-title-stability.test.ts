import { describe, expect, it, vi } from 'vitest'
import { createBrowserPageWebviewNavigationHandlers } from './browser-page-webview-navigation-handlers'

function createHarness(readCurrentTitle: () => string, readUrl = () => 'https://example.com/') {
  const update = vi.fn()
  const history = vi.fn()
  const ref = <T>(current: T) => ({ current })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Title events only read these two WebView methods.
  const webview = { getURL: readUrl, getTitle: readCurrentTitle } as Electron.WebviewTag
  const handlers = createBrowserPageWebviewNavigationHandlers({
    webview,
    browserTabId: 'active-page',
    browserTabUrl: 'https://example.com/',
    recoveryNavigationValidationRef: ref(null),
    activeLoadFailureRef: ref(null),
    lastKnownWebviewUrlRef: ref(null),
    addressBarInputRef: ref(null),
    onSetUrlRef: ref(vi.fn()),
    onUpdatePageStateRef: ref(update),
    addBrowserHistoryEntryRef: ref(history),
    faviconUrlRef: ref('https://example.com/icon.png'),
    setAddressBarValue: vi.fn(),
    annotationViewportBridgeTokenRef: ref('token'),
    setBrowserOverlayViewport: vi.fn()
  })
  return { handlers, update, history }
}

describe('ORCAW-006 title event contract', () => {
  it('publishes the current title to the active page and history, retaining the favicon', () => {
    const { handlers, update, history } = createHarness(() => 'Stable page')
    handlers.handleTitleUpdate({ title: '⠋ π - transient page' })
    expect(update).toHaveBeenCalledWith('active-page', { title: 'Stable page' })
    expect(history).toHaveBeenCalledWith(
      'https://example.com/',
      'Stable page',
      'https://example.com/icon.png'
    )
  })

  it.each([
    ['empty', () => ''],
    [
      'unavailable',
      () => {
        throw new Error('guest not attached')
      }
    ]
  ])('falls back to the event title when the current title is %s', (_label, readTitle) => {
    const { handlers, update } = createHarness(readTitle)
    handlers.handleTitleUpdate({ title: 'Event page' })
    expect(update).toHaveBeenCalledWith('active-page', { title: 'Event page' })
  })

  it('does not publish before the guest URL is available', () => {
    const { handlers, update, history } = createHarness(
      () => 'Stable page',
      () => {
        throw new Error('guest not attached')
      }
    )
    handlers.handleTitleUpdate({ title: 'Old page' })
    expect(update).not.toHaveBeenCalled()
    expect(history).not.toHaveBeenCalled()
  })
})
