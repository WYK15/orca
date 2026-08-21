import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const modulePath = fileURLToPath(new URL('../packaged-runtime-node-modules.cjs', import.meta.url))
const requireFromModule = createRequire(modulePath)
const configDir = dirname(modulePath)
const rootDir = dirname(configDir)

function loadNativeGuard({ watcher = true, windowsAddon = true } = {}) {
  const installed = new Set([
    join(rootDir, 'node_modules', '@parcel', 'watcher', 'package.json'),
    ...(watcher
      ? [join(rootDir, 'node_modules', '@parcel', 'watcher-win32-arm64', 'package.json')]
      : []),
    ...(windowsAddon
      ? [join(rootDir, 'node_modules', '@vscode', 'windows-process-tree', 'package.json')]
      : [])
  ])
  const fakeFs = {
    ...require('node:fs'),
    existsSync: (path) => installed.has(path),
    readdirSync: () => (watcher ? ['watcher', 'watcher-win32-arm64'] : ['watcher']),
    readFileSync: (path) =>
      JSON.stringify(
        path === join(rootDir, 'package.json')
          ? { optionalDependencies: { 'sherpa-onnx-win-x64': '1.12.31' } }
          : { optionalDependencies: { '@parcel/watcher-win32-arm64': '2.5.6' } }
      )
  }
  const module = { exports: {} }
  runInNewContext(readFileSync(modulePath, 'utf8'), {
    module,
    exports: module.exports,
    __dirname: configDir,
    require: (name) => (name === 'node:fs' ? fakeFs : requireFromModule(name)),
    process
  })
  return module.exports.assertPackagedNativeVariantsInstalled
}

describe('Windows ARM64 cloud-only native packaging policy', () => {
  it('does not require the unsupported x64 speech addon for ARM64', () => {
    expect(() => loadNativeGuard()('win32', 3)).not.toThrow()
  })

  it('still requires the x64 speech addon for Windows x64', () => {
    expect(() => loadNativeGuard()('win32', 1)).toThrow('sherpa-onnx-win-x64')
  })

  it('still requires Windows process enumeration on ARM64', () => {
    expect(() => loadNativeGuard({ windowsAddon: false })('win32', 3)).toThrow(
      '@vscode/windows-process-tree'
    )
  })

  it('still requires the target watcher variant on ARM64', () => {
    expect(() => loadNativeGuard({ watcher: false })('win32', 3)).toThrow(
      '@parcel/watcher-win32-arm64'
    )
  })
})
