import { describe, expect, it } from 'vitest'
import { resolveBrowserPageTitleEvent } from './browser-page-title-event'

describe('browser page title events', () => {
  it('uses the current WebView title instead of a transient event title', () => {
    expect(resolveBrowserPageTitleEvent('⠋ π - pi-web', () => 'pi-kit - Pi Web')).toBe(
      'pi-kit - Pi Web'
    )
  })

  it('falls back to the event title when the current WebView title is empty', () => {
    expect(resolveBrowserPageTitleEvent('Example', () => '')).toBe('Example')
  })

  it('falls back to the event title when the current WebView title is unavailable', () => {
    expect(
      resolveBrowserPageTitleEvent('Example', () => {
        throw new Error('guest not attached')
      })
    ).toBe('Example')
  })
})
