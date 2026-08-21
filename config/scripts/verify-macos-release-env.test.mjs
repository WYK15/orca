import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scriptPath = 'config/scripts/verify-macos-release-env.mjs'
const required = {
  CSC_LINK: 'certificate',
  CSC_KEY_PASSWORD: 'password',
  APPLE_API_KEY: '/private/api-key.p8',
  APPLE_API_KEY_ID: 'key-id',
  APPLE_API_ISSUER: 'issuer-id'
}

function verify(env) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

describe('macOS release environment', () => {
  it('accepts Developer ID signing and App Store Connect API-key credentials', () => {
    expect(verify(required).status).toBe(0)
  })

  it('reports a missing App Store Connect API-key credential', () => {
    const { APPLE_API_KEY: _apiKey, ...withoutApiKey } = required

    expect(verify(withoutApiKey)).toMatchObject({ status: 1 })
    expect(verify(withoutApiKey).stderr).toContain('APPLE_API_KEY')
  })

  it('requires signed and notarized fork macOS packages', () => {
    const workflow = readFileSync('.github/workflows/fork-desktop-packages.yml', 'utf8')

    expect(workflow).toContain('node config/scripts/verify-macos-release-env.mjs')
    expect(workflow).toContain('ORCA_MAC_RELEASE=1 pnpm exec electron-builder')
    expect(workflow).toContain('Prepare macOS signing and notarization keys')
    expect(workflow).toContain('CSC_LINK:')
    expect(workflow).toContain('APPLE_API_KEY_BASE64:')
  })
})
