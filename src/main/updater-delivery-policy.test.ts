import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createAvailableReleaseStatus,
  getReleaseUpdateDelivery,
  readPackagedReleaseAutoUpdateEnabled
} from './updater-delivery-policy'

describe('getReleaseUpdateDelivery', () => {
  it('keeps Linux releases automatic without signing metadata', () => {
    expect(getReleaseUpdateDelivery('linux', false)).toBe('automatic')
  })

  it.each(['darwin', 'win32'] as const)(
    'uses manual delivery for unsigned %s builds',
    (platform) => {
      expect(getReleaseUpdateDelivery(platform, false)).toBe('manual')
    }
  )

  it.each(['darwin', 'win32'] as const)(
    'uses automatic delivery for signed %s builds',
    (platform) => {
      expect(getReleaseUpdateDelivery(platform, true)).toBe('automatic')
    }
  )
})

function appPathWith(metadata: Record<string, unknown>): string {
  const appPath = mkdtempSync(join(tmpdir(), 'orcaw-update-policy-'))
  writeFileSync(join(appPath, 'package.json'), JSON.stringify(metadata))
  return appPath
}

describe('readPackagedReleaseAutoUpdateEnabled', () => {
  it('uses explicit packaged release metadata on Windows', () => {
    expect(
      readPackagedReleaseAutoUpdateEnabled(appPathWith({ orcawReleaseAutoUpdate: true }), 'win32')
    ).toBe(true)
    expect(
      readPackagedReleaseAutoUpdateEnabled(appPathWith({ orcawReleaseAutoUpdate: false }), 'win32')
    ).toBe(false)
  })

  it('accepts legacy signed macOS metadata', () => {
    expect(
      readPackagedReleaseAutoUpdateEnabled(appPathWith({ orcawMacAutoUpdate: true }), 'darwin')
    ).toBe(true)
  })

  it.each(['darwin', 'win32'] as const)('fails closed for missing %s metadata', (platform) => {
    expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({}), platform)).toBe(false)
  })

  it('keeps legacy Linux packages automatic', () => {
    expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({}), 'linux')).toBe(true)
  })

  it('rejects missing and malformed package metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'orcaw-update-policy-'))
    const missingPath = join(root, 'missing')
    const malformedPath = join(root, 'malformed')
    mkdirSync(missingPath)
    mkdirSync(malformedPath)
    writeFileSync(join(malformedPath, 'package.json'), '{')

    expect(readPackagedReleaseAutoUpdateEnabled(missingPath, 'win32')).toBe(false)
    expect(readPackagedReleaseAutoUpdateEnabled(malformedPath, 'darwin')).toBe(false)
  })
})

describe('createAvailableReleaseStatus', () => {
  it('includes manual delivery and the matching fork release URL', () => {
    expect(createAvailableReleaseStatus('1.4.165-wyk.2', null, 'manual')).toEqual({
      releaseUrl: 'https://github.com/WYK15/orca/releases/tag/v1.4.165-wyk.2',
      status: {
        state: 'available',
        version: '1.4.165-wyk.2',
        changelog: null,
        delivery: 'manual',
        releaseUrl: 'https://github.com/WYK15/orca/releases/tag/v1.4.165-wyk.2'
      }
    })
  })

  it('keeps automatic status payloads backward-compatible', () => {
    expect(createAvailableReleaseStatus('1.4.165-wyk.2', null, 'automatic').status).toEqual({
      state: 'available',
      version: '1.4.165-wyk.2',
      changelog: null
    })
  })
})
