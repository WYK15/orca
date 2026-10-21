import { describe, expect, it } from 'vitest'
import { decodeDesktopValue, encodeDesktopValue } from './desktop-wire-codec'

describe('desktop wire values', () => {
  it('round trips nested binary terminal frames through JSON', () => {
    const original = { args: [new Uint8Array([0, 10, 27, 128, 255]), { text: '中文 -> &gt;' }] }
    const json = JSON.stringify(encodeDesktopValue(original))
    expect(decodeDesktopValue(JSON.parse(json))).toEqual(original)
  })

  it('encodes only the visible range of Node buffers and typed-array views', () => {
    const source = Buffer.from([1, 2, 3, 4])
    const value = decodeDesktopValue(encodeDesktopValue(source.subarray(1, 3)))
    expect(value).toEqual(new Uint8Array([2, 3]))
  })

  it('handles large frames without overflowing the JS argument stack', () => {
    const bytes = new Uint8Array(1024 * 1024).fill(241)
    expect(decodeDesktopValue(encodeDesktopValue(bytes))).toEqual(bytes)
  })
})
