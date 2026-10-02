import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  getForkReleaseVersion,
  parseStableUpstreamTag,
  validateForkRelease
} from './fork-release-contract.mjs'

const scriptPath = 'config/scripts/fork-release-contract.mjs'

function run(...args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

describe('fork release contract', () => {
  it('accepts only a stable upstream tag', () => {
    expect(parseStableUpstreamTag('v1.4.187')).toEqual({
      tag: 'v1.4.187',
      version: '1.4.187'
    })
    expect(() => parseStableUpstreamTag('v1.4.187-rc.2')).toThrow('Stable upstream tag required')
    expect(() => parseStableUpstreamTag('1.4.187')).toThrow('Stable upstream tag required')
  })

  it('builds the fork version from the upstream version and positive revision', () => {
    expect(getForkReleaseVersion('1.4.187', 1)).toBe('1.4.187-wyk.1')
    expect(() => getForkReleaseVersion('1.4.187', 0)).toThrow('Fork revision must be positive')
  })

  it('accepts aligned package and release versions', () => {
    expect(
      validateForkRelease({
        upstreamTag: 'v1.4.187',
        upstreamPackageVersion: '1.4.187',
        forkPackageVersion: '1.4.187-wyk.1',
        releaseTag: 'v1.4.187-wyk.1'
      })
    ).toEqual([])
  })

  it('reports mismatched upstream, fork package, and release tag versions', () => {
    expect(
      validateForkRelease({
        upstreamTag: 'v1.4.187',
        upstreamPackageVersion: '1.4.186',
        forkPackageVersion: '1.4.186-wyk.4',
        releaseTag: 'v1.4.187-wyk.1'
      })
    ).toEqual(
      expect.arrayContaining([
        'Upstream package version 1.4.186 does not match v1.4.187',
        'Fork package version must start with 1.4.187-wyk.'
      ])
    )
  })

  it('reports a release tag that differs from the fork package version', () => {
    expect(
      validateForkRelease({
        upstreamTag: 'v1.4.187',
        upstreamPackageVersion: '1.4.187',
        forkPackageVersion: '1.4.187-wyk.2',
        releaseTag: 'v1.4.187-wyk.1'
      })
    ).toContain('Release tag v1.4.187-wyk.1 does not match fork package version 1.4.187-wyk.2')
  })

  it('supports stable-tag and full-release CLI validation', () => {
    const stableResult = run('--stable-tag', 'v1.4.187')
    const releaseResult = run('--release', 'v1.4.187', '1.4.187', '1.4.187-wyk.1', 'v1.4.187-wyk.1')

    expect(stableResult.status).toBe(0)
    expect(stableResult.stdout).toContain('Stable upstream tag valid: v1.4.187')
    expect(releaseResult.status).toBe(0)
    expect(releaseResult.stdout).toContain('Fork release contract valid')
  })

  it('returns a nonzero CLI status for a release candidate', () => {
    const result = run('--stable-tag', 'v1.4.187-rc.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Stable upstream tag required')
  })
})
