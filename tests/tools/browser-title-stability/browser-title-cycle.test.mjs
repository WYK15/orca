import { describe, expect, it } from 'vitest'
import {
  STABLE_TITLE,
  emitTransientTitlePair
} from '../../manual/browser-title-stability/browser-title-cycle.mjs'

describe('browser title cycle', () => {
  it('emits a transient spinner title before restoring the stable title', () => {
    const titles = []
    const documentObject = {
      set title(value) {
        titles.push(value)
      }
    }

    expect(emitTransientTitlePair(documentObject, 0)).toBe(STABLE_TITLE)
    expect(titles).toEqual(['⠋ π - title-jitter-test', STABLE_TITLE])
  })

  it('cycles spinner frames while always ending on the stable title', () => {
    const titles = []
    const documentObject = {
      set title(value) {
        titles.push(value)
      }
    }

    emitTransientTitlePair(documentObject, 1)
    emitTransientTitlePair(documentObject, 2)

    expect(titles).toEqual([
      '⠙ π - title-jitter-test',
      STABLE_TITLE,
      '⠹ π - title-jitter-test',
      STABLE_TITLE
    ])
  })
})
