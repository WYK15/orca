import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  copyFileSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const source = readFileSync(resolve('config/electron-builder.config.cjs'), 'utf8')
const nativeBuildSource = readFileSync('config/scripts/build-computer-macos.mjs', 'utf8')
const verifier = 'config/scripts/verify-computer-native.mjs'

function load(env, exists = () => true, execute = vi.fn()) {
  const module = { exports: {} }
  runInNewContext(
    `${source}\nmodule.exports = { signMacComputerUseHelper, signMacStandaloneHelper, signMacSelfSignedApp };`,
    {
      module,
      __dirname: resolve('config'),
      process: { env },
      require: (id) => {
        if (id === 'node:child_process') {
          return { execFileSync: execute }
        }
        if (id === 'node:fs') {
          return { ...require(id), existsSync: exists }
        }
        // Isolate signing tests from optional cross-platform package/resource discovery.
        if (id === './packaged-runtime-node-modules.cjs') {
          return {
            ...require(resolve('config', id)),
            createPackagedRuntimeNodeModuleResources: () => []
          }
        }
        return require(id.startsWith('.') ? resolve('config', id) : id)
      }
    }
  )
  return { ...module.exports, execute }
}

const hostileEnv = {
  ORCA_MAC_SELF_SIGNED: '1',
  ORCA_MAC_RELEASE: '1',
  CSC_LINK: 'invalid-secret',
  CSC_NAME: 'Developer ID Application: Unwanted',
  ORCA_COMPUTER_MACOS_SIGN_IDENTITY: 'Unwanted',
  ORCA_MACOS_SIGNING_KEYCHAIN: 'unwanted'
}

function createApp(app, bundleId) {
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  copyFileSync('/usr/bin/true', join(app, 'Contents', 'MacOS', 'Orcaw'))
  writeFileSync(
    join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Orcaw</string><key>CFBundleIdentifier</key><string>${bundleId}</string></dict></plist>`
  )
}

describe('explicit macOS self-signing', () => {
  it('ignores installed identities and inherited secrets for every signing target', async () => {
    const loaded = load(hostileEnv)
    const packager = {
      get codeSigningInfo() {
        throw new Error('must not import certificate')
      }
    }
    await loaded.signMacComputerUseHelper('/helper.app', packager)
    await loaded.signMacStandaloneHelper('/notification', 'notification', packager)
    await loaded.signMacStandaloneHelper('/keyboard', 'keyboard', packager)
    loaded.signMacSelfSignedApp('/outer.app')
    const calls = loaded.execute.mock.calls
    expect(calls.every(([command]) => command === 'codesign')).toBe(true)
    const signs = calls.filter(([, args]) => args.includes('--sign'))
    expect(signs).toHaveLength(5)
    for (const [, args] of signs) {
      expect(args[args.indexOf('--sign') + 1]).toBe('-')
      expect(args).not.toContain('--timestamp')
      expect(args).not.toContain('runtime')
    }
    const outerSigns = signs.filter(([, args]) => args.at(-1) === '/outer.app')
    expect(outerSigns[0][1]).toContain('--preserve-metadata=entitlements')
    expect(outerSigns[0][1]).not.toContain('--entitlements')
    expect(outerSigns[1][1]).not.toContain('--deep')
    expect(calls.some(([, args]) => args.join(' ') === '--verify --deep --strict /outer.app')).toBe(
      true
    )
    expect(source).toContain("signMacSelfSignedApp(join(resourcesDir, '..', '..'))")
  })

  it('uses ad-hoc signing during the native helper build without querying keychains', () => {
    const start = nativeBuildSource.indexOf('function resolveSigningIdentity()')
    const end = nativeBuildSource.indexOf('\nfunction run(', start)
    const spawn = vi.fn(() => {
      throw new Error('must not discover identity')
    })
    const identity = runInNewContext(`(${nativeBuildSource.slice(start, end)})()`, {
      process: { env: hostileEnv },
      spawnSync: spawn
    })
    expect(identity).toBe('-')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('keeps missing packaged helpers fatal in self-signed mode', async () => {
    const loaded = load(hostileEnv, () => false)
    await expect(loaded.signMacComputerUseHelper('/missing.app')).rejects.toThrow('Missing')
    await expect(loaded.signMacStandaloneHelper('/missing', 'keyboard')).rejects.toThrow('Missing')
  })

  it('does not allow regular releases to fall back to ad-hoc signing', async () => {
    const loaded = load(
      { ORCA_MAC_RELEASE: '1' },
      () => true,
      vi.fn(() => '')
    )
    await expect(loaded.signMacComputerUseHelper('/helper.app')).rejects.toThrow(
      'Missing signing identity'
    )
    await expect(loaded.signMacStandaloneHelper('/helper', 'helper')).rejects.toThrow(
      'Missing signing identity'
    )
  })

  it('propagates strict signature verification failures instead of accepting a mode flag', () => {
    const loaded = load(
      hostileEnv,
      () => true,
      vi.fn((command, args) => {
        if (args.includes('--verify')) {
          throw new Error('invalid signature')
        }
      })
    )
    expect(() => loaded.signMacSelfSignedApp('/outer.app')).toThrow('invalid signature')
  })

  it('fails CLI signature acceptance when codesign is unavailable', () => {
    const result = spawnSync(process.execPath, [verifier, '--self-signed', '/missing.app'], {
      env: { ...process.env, PATH: '' },
      encoding: 'utf8'
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('expected ad-hoc signature')
  })

  it.skipIf(process.platform !== 'darwin')(
    'preserves nested JIT entitlements and strictly verifies real apps',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'orcaw-self-sign-'))
      try {
        const apps = ['mac', 'mac-arm64'].map((slice) => join(dir, slice, 'Orcaw.app'))
        const nestedApps = apps.map((app) =>
          join(app, 'Contents', 'Frameworks', 'Orcaw Helper.app')
        )
        const nestedEntitlements = join(dir, 'nested.plist')
        writeFileSync(
          nestedEntitlements,
          '<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/><key>com.wyk15.fixture.nested-only</key><true/></dict></plist>'
        )
        for (const [index, app] of apps.entries()) {
          createApp(app, 'com.wyk15.orcaw.test')
          createApp(nestedApps[index], 'com.wyk15.orcaw.test.helper')
          execFileSync(
            'codesign',
            ['--force', '--sign', '-', '--entitlements', nestedEntitlements, nestedApps[index]],
            { stdio: 'pipe' }
          )
          load(hostileEnv, existsSync, execFileSync).signMacSelfSignedApp(app)
          const entitlements = execFileSync(
            'codesign',
            ['--display', '--entitlements', ':-', nestedApps[index]],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
          )
          expect(entitlements).toContain('com.apple.security.cs.allow-jit')
          expect(entitlements).toContain('com.wyk15.fixture.nested-only')
          execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' })
        }
        execFileSync(process.execPath, [verifier, '--self-signed', ...apps], { stdio: 'pipe' })
        execFileSync('codesign', ['--remove-signature', apps[0]], { stdio: 'pipe' })
        expect(() =>
          execFileSync(process.execPath, [verifier, '--self-signed', apps[0]], { stdio: 'pipe' })
        ).toThrow()
        writeFileSync(join(nestedApps[1], 'Contents', 'MacOS', 'Orcaw'), 'tampered')
        expect(() =>
          execFileSync(process.execPath, [verifier, '--self-signed', apps[1]], { stdio: 'pipe' })
        ).toThrow()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )
})
