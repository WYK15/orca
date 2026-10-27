import { expect, it } from 'vitest'

export function registerTauriKeyboardInputSourceTest(scope) {
  it('reports the native input method and tolerates an unavailable input source', async () => {
    const { call, nativeResponses } = scope()
    for (const source of [
      'com.apple.inputmethod.SCIM.Shuangpin',
      'com.apple.keylayout.ABC',
      null
    ]) {
      nativeResponses.set('keyboard-input-source', source)
      expect(await call('app:getKeyboardInputSourceId')).toBe(
        process.platform === 'darwin' ? source : null
      )
    }
    nativeResponses.delete('keyboard-input-source')
    expect(await call('app:getKeyboardInputSourceId')).toBeNull()
  })
}
