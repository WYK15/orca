import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveMacOSComputerUseAppPath } from './macos-native-provider-paths'

vi.mock('node:fs', () => ({
  existsSync: vi.fn()
}))

const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath')

describe('resolveMacOSComputerUseAppPath', () => {
  afterEach(() => {
    vi.mocked(existsSync).mockReset()
    delete process.env.ORCA_COMPUTER_MACOS_HELPER_APP_PATH
    if (originalResourcesPath) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPath)
    } else {
      Reflect.deleteProperty(process, 'resourcesPath')
    }
  })

  it('resolves the packaged Orcaw helper app', () => {
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/Applications/Orcaw.app/Contents/Resources'
    })
    vi.mocked(existsSync).mockImplementation(
      (candidate) =>
        candidate === '/Applications/Orcaw.app/Contents/Resources/Orcaw Computer Use.app'
    )

    expect(resolveMacOSComputerUseAppPath()).toBe(
      '/Applications/Orcaw.app/Contents/Resources/Orcaw Computer Use.app'
    )
  })
})
