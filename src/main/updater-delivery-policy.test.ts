import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createAvailableReleaseStatus,
  getReleaseUpdateDelivery,
  readPackagedMacAutoUpdateEnabled
} from './updater-delivery-policy'

describe('getReleaseUpdateDelivery', () => {
  it.each(['win32', 'linux'] as const)('%s releases update automatically', (platform) => {
    expect(getReleaseUpdateDelivery(platform, false)).toBe('automatic')
  })

  it('uses manual delivery for unsigned macOS builds', () => {
    expect(getReleaseUpdateDelivery('darwin', false)).toBe('manual')
  })

  it('uses automatic delivery for signed macOS release builds', () => {
    expect(getReleaseUpdateDelivery('darwin', true)).toBe('automatic')
  })
})

describe('readPackagedMacAutoUpdateEnabled', () => {
  it('accepts only the literal boolean true from packaged metadata', () => {
    const appPath = mkdtempSync(join(tmpdir(), 'orcaw-update-policy-'))
    writeFileSync(join(appPath, 'package.json'), JSON.stringify({ orcawMacAutoUpdate: true }))

    expect(readPackagedMacAutoUpdateEnabled(appPath)).toBe(true)
  })

  it.each([
    ['missing field', {}],
    ['false field', { orcawMacAutoUpdate: false }],
    ['string field', { orcawMacAutoUpdate: 'true' }]
  ])('rejects %s', (_label, metadata) => {
    const appPath = mkdtempSync(join(tmpdir(), 'orcaw-update-policy-'))
    writeFileSync(join(appPath, 'package.json'), JSON.stringify(metadata))

    expect(readPackagedMacAutoUpdateEnabled(appPath)).toBe(false)
  })

  it('rejects missing and malformed package metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'orcaw-update-policy-'))
    const missingPath = join(root, 'missing')
    const malformedPath = join(root, 'malformed')
    mkdirSync(missingPath)
    mkdirSync(malformedPath)
    writeFileSync(join(malformedPath, 'package.json'), '{')

    expect(readPackagedMacAutoUpdateEnabled(missingPath)).toBe(false)
    expect(readPackagedMacAutoUpdateEnabled(malformedPath)).toBe(false)
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
