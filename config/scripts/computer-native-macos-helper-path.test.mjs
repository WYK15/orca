import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { macOSComputerHelperAppPath } from './computer-native-macos-helper-path.mjs'

describe('macOSComputerHelperAppPath', () => {
  it('uses the configured Orcaw helper application name', () => {
    expect(macOSComputerHelperAppPath('/repo')).toBe(
      path.join(
        '/repo',
        'native',
        'computer-use-macos',
        '.build',
        'release',
        'Orcaw Computer Use.app'
      )
    )
  })
})
