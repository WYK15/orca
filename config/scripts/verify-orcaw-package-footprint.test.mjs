import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { verifyOrcawPackageFootprint } = require('./verify-orcaw-package-footprint.cjs')
const config = require('../electron-builder.config.cjs')
let root
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-footprint-'))
  mkdirSync(join(root, 'relay'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('retains one SSH relay and simulator package without removed features', () => {
  mkdirSync(join(root, 'node_modules', 'serve-sim'), { recursive: true })
  expect(() =>
    verifyOrcawPackageFootprint(root, { listPackage: () => ['/out/main/index.js'] })
  ).not.toThrow()
  for (const platform of ['mac', 'win', 'linux']) {
    expect(config[platform].extraResources.some((entry) => /sherpa-onnx/.test(entry.from))).toBe(
      false
    )
    expect(config[platform].extraResources.some((entry) => entry.to === 'serve-sim')).toBe(false)
    expect(
      config[platform].extraResources.find((entry) => entry.to === 'onboarding/feature-wall').filter
    ).toEqual(['*.poster.jpg'])
  }
})

it.each([
  '/out/web/web-index.html',
  '/out/relay/relay.js',
  '/out/main/stt-worker.js',
  '/src-tauri/target/release/orcaw-tauri',
  '/out/tauri-node/node-v24.22.0-darwin-arm64/bin/node',
  '/out/tauri-backend/desktop-host.cjs',
  '\\out\\web\\web-index.html'
])('rejects a stale removed archive entry: %s', (entry) => {
  expect(() => verifyOrcawPackageFootprint(root, { listPackage: () => [entry] })).toThrow(
    'Unwanted packaged resources'
  )
})

it.each([
  ['serve-sim', 'Duplicate serve-sim'],
  ['node_modules/sherpa-onnx-darwin-arm64', 'speech libraries']
])('rejects extra resource %s', (relative, error) => {
  mkdirSync(join(root, ...relative.split('/')), { recursive: true })
  expect(() => verifyOrcawPackageFootprint(root, { listPackage: () => [] })).toThrow(error)
})

it('rejects welcome GIFs copied by an outdated packaging rule', () => {
  const previews = join(root, 'onboarding', 'feature-wall')
  mkdirSync(previews, { recursive: true })
  writeFileSync(join(previews, 'tile-01.gif'), 'gif')
  expect(() => verifyOrcawPackageFootprint(root, { listPackage: () => [] })).toThrow(
    'welcome animation'
  )
})
