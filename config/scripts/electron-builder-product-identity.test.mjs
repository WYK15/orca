import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')
const MUTABLE_BUILD_ENV = [
  'ORCA_MAC_HOURLY',
  'ORCA_MAC_ADHOC',
  'ORCA_MAC_RELEASE',
  'ORCA_HOURLY_BUILD_VERSION',
  'ORCA_ADHOC_BUILD_VERSION',
  'ORCA_LOCAL_BUILD_VERSION',
  'ORCA_LINUX_ARM64_RELEASE',
  'ORCA_RELEASE_AUTO_UPDATE'
]

function withEnv(env, assert) {
  const configPath = require.resolve('../electron-builder.config.cjs')
  const original = Object.fromEntries(MUTABLE_BUILD_ENV.map((key) => [key, process.env[key]]))
  try {
    for (const key of MUTABLE_BUILD_ENV) {
      delete process.env[key]
    }
    Object.assign(process.env, env)
    delete require.cache[configPath]
    assert(require('../electron-builder.config.cjs'))
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    delete require.cache[configPath]
    require('../electron-builder.config.cjs')
  }
}

const withHourlyEnv = (assert) => withEnv({ ORCA_MAC_HOURLY: '1' }, assert)
const withAdhocEnv = (assert) => withEnv({ ORCA_MAC_ADHOC: '1' }, assert)

describe('electron-builder product identity', () => {
  it('packages the independent Orcaw desktop identity', () => {
    expect(electronBuilderConfig).toMatchObject({
      appId: 'com.wyk15.orcaw',
      productName: 'Orcaw'
    })
    expect(electronBuilderConfig.win.executableName).toBe('Orcaw')
    expect(electronBuilderConfig.linux.executableName).toBe('orcaw-ide')
    expect(electronBuilderConfig.publish).toMatchObject({
      owner: 'WYK15',
      repo: 'orca'
    })
    expect(require('../../package.json')).toMatchObject({
      name: 'orcaw',
      homepage: 'https://github.com/WYK15/orca'
    })
  })

  it('keeps packaged identity aligned with local-build validation', () => {
    expect(electronBuilderConfig.appId).toBe(
      require('../../src/shared/local-build-compatibility-contract.json').appId
    )
  })

  it('uses Orcaw artifact and Linux package names', () => {
    expect(electronBuilderConfig.nsis.artifactName).toBe('orcaw-windows-setup.${ext}')
    expect(electronBuilderConfig.dmg.artifactName).toBe('orcaw-macos-${arch}.${ext}')
    expect(electronBuilderConfig.appImage.artifactName).toBe('orcaw-linux.${ext}')
    expect(electronBuilderConfig.deb).toMatchObject({
      packageName: 'orcaw-ide',
      artifactName: 'orcaw-ide_${version}_${arch}.${ext}'
    })
    expect(electronBuilderConfig.rpm).toMatchObject({
      packageName: 'orcaw-ide',
      artifactName: 'orcaw-ide-${version}.${arch}.${ext}'
    })
  })

  it('matches the Linux desktop entry to the Orcaw window class', () => {
    expect(electronBuilderConfig.linux.desktop.entry.StartupWMClass).toBe('orcaw-ide')
  })

  it('uses a distinct Orcaw AppImage name for Linux arm64 uploads', () => {
    withEnv({ ORCA_LINUX_ARM64_RELEASE: '1' }, (config) => {
      expect(config.appImage.artifactName).toBe('orcaw-linux-arm64.${ext}')
    })
  })

  it('stamps unsigned local packages without enabling macOS auto-update', () => {
    withEnv({ ORCA_LOCAL_BUILD_VERSION: '1.4.159-rc.0.local.123.abc' }, (config) => {
      expect(config.extraMetadata).toEqual({
        version: '1.4.159-rc.0.local.123.abc',
        orcawMacAutoUpdate: false,
        orcawReleaseAutoUpdate: false
      })
    })
  })

  it('does not apply local semver to signed release packaging', () => {
    withEnv(
      {
        ORCA_LOCAL_BUILD_VERSION: '1.4.159-local.123.abc',
        ORCA_MAC_RELEASE: '1'
      },
      (config) => {
        expect(config.extraMetadata).toEqual({
          orcawMacAutoUpdate: true,
          orcawReleaseAutoUpdate: true
        })
      }
    )
  })

  it('stamps explicitly auto-updatable release packages', () => {
    withEnv({ ORCA_RELEASE_AUTO_UPDATE: '1' }, (config) => {
      expect(config.extraMetadata.orcawReleaseAutoUpdate).toBe(true)
    })
  })

  it('uses the Orcaw signing identity for hourly builds', () => {
    withHourlyEnv((config) => {
      expect(config.mac.appId).toBeUndefined()
      expect(config.appId).toBe('com.wyk15.orcaw')
      expect(config.mac.hardenedRuntime).toBe(true)
      expect(config.mac.notarize).toBe(true)
      expect(config.forceCodeSigning).toBe(true)
    })
  })

  it('keeps local macOS builds unsigned and release builds notarized', () => {
    withEnv({ ORCA_MAC_RELEASE: '1' }, (config) => {
      expect(config.mac.notarize).toBe(true)
    })
    expect(electronBuilderConfig.mac.notarize).toBe(false)
  })

  it('keeps every channel scoped to the fork repository', () => {
    for (const inspect of [withHourlyEnv, withAdhocEnv]) {
      inspect((config) => {
        expect(config.publish).toMatchObject({
          owner: 'WYK15',
          repo: 'orca',
          releaseType: 'prerelease'
        })
      })
    }
    expect(electronBuilderConfig.publish).toMatchObject({
      owner: 'WYK15',
      repo: 'orca',
      releaseType: 'prerelease'
    })
  })

  it('stamps hourly packages with the hourly version', () => {
    withEnv(
      { ORCA_MAC_HOURLY: '1', ORCA_HOURLY_BUILD_VERSION: '1.4.160-hourly.202607281400' },
      (config) => {
        expect(config.extraMetadata).toEqual({
          version: '1.4.160-hourly.202607281400',
          orcawMacAutoUpdate: true,
          orcawReleaseAutoUpdate: true
        })
      }
    )
  })

  it('uses the Orcaw signing identity and version for adhoc builds', () => {
    withEnv(
      { ORCA_MAC_ADHOC: '1', ORCA_ADHOC_BUILD_VERSION: '1.4.160-adhoc.20260728140533' },
      (config) => {
        expect(config.appId).toBe('com.wyk15.orcaw')
        expect(config.mac.hardenedRuntime).toBe(true)
        expect(config.mac.notarize).toBe(true)
        expect(config.forceCodeSigning).toBe(true)
        expect(config.extraMetadata).toEqual({
          version: '1.4.160-adhoc.20260728140533',
          orcawMacAutoUpdate: true,
          orcawReleaseAutoUpdate: true
        })
      }
    )
  })
})
