import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const scriptPath = 'config/scripts/release-publication-kind.mjs'

function classify(tag) {
  return execFileSync(process.execPath, [scriptPath, tag], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

describe('release publication kind', () => {
  it.each(['v1.4.165', 'v1.4.165-wyk.5'])('publishes %s as a normal release', (tag) => {
    expect(classify(tag)).toBe('release')
  })

  it.each([
    'v1.4.166-rc.1',
    'v1.4.166-beta.2',
    'v1.4.166-hourly.202608051200',
    'v1.4.165-wyk.next'
  ])('publishes %s as a prerelease', (tag) => {
    expect(classify(tag)).toBe('prerelease')
  })

  it.each(['1.4.165-wyk.5', 'v1.4-wyk.5', 'v1.4.165-wyk.'])(
    'rejects malformed release tag %s',
    (tag) => {
      expect(() => classify(tag)).toThrow()
    }
  )
})
