import { cpSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { verifyPackagedRipgrep } = require('./verify-packaged-ripgrep.cjs')
const config = require('../electron-builder.config.cjs')
const root = dirname(dirname(require.resolve('@vscode/ripgrep-universal')))
const temporaryPaths = []

afterEach(() =>
  temporaryPaths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
)

it.each([
  ['mac', 'darwin', 'arm64'],
  ['mac', 'darwin', 'x64'],
  ['win', 'win32', 'x64'],
  ['win', 'win32', 'arm64'],
  ['linux', 'linux', 'x64'],
  ['linux', 'linux', 'arm64']
])('packages only the matching %s %s %s binary', (configPlatform, platform, arch) => {
  const resources = config[configPlatform].extraResources.filter(
    (entry) => entry.to === 'ripgrep' && entry.filter
  )
  expect(resources).toHaveLength(1)
  const mapping = resources[0]
  expect(config.files).toContain('!node_modules/@vscode/ripgrep-universal{,/**/*}')
  const source = mapping.from.replace('${arch}', arch)
  const target = mkdtempSync(join(tmpdir(), 'orca-rg-package-'))
  temporaryPaths.push(target)
  mkdirSync(join(target, 'ripgrep'))
  for (const filename of mapping.filter) {
    cpSync(join(source, filename), join(target, 'ripgrep', filename))
  }
  const binary = join(target, 'ripgrep', platform === 'win32' ? 'rg.exe' : 'rg')
  expect(readFileSync(binary)).toEqual(
    readFileSync(join(root, 'bin', `${platform}-${arch}`, mapping.filter[0]))
  )
  const archEnum = { x64: 1, arm64: 3 }[arch]
  expect(() => verifyPackagedRipgrep(target, platform, archEnum)).not.toThrow()
  if (platform === process.platform && arch === process.arch) {
    expect(
      execFileSync(binary, ['--version'], { encoding: 'utf8', env: { ...process.env, PATH: '' } })
    ).toMatch(/^ripgrep /)
  }
})

it('rejects an installer without the executable', () => {
  expect(() => verifyPackagedRipgrep('/missing-resources', process.platform, 3)).toThrow(
    'Missing bundled ripgrep'
  )
})
