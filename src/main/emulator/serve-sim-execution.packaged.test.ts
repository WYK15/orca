import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveServeSimExecutable } from './serve-sim-execution'

const { materialize } = vi.hoisted(() => ({ materialize: vi.fn(() => '/materialized/simulator') }))
vi.mock('electron', () => ({
  app: {
    getPath: () => '/test-user',
    getVersion: () => 'test-version',
    getAppPath: () => '/test-app'
  }
}))
vi.mock('./serve-sim-runtime-materializer', () => ({ materializeServeSimRuntime: materialize }))
let root = ''
afterEach(() => {
  vi.unstubAllGlobals()
  if (root) {
    rmSync(root, { recursive: true, force: true })
  }
})
it('resolves the single packaged Node module and preserves macOS materialization', () => {
  root = mkdtempSync(join(tmpdir(), 'orca-simulator-path-'))
  const packageDir = join(root, 'node_modules', 'serve-sim')
  mkdirSync(join(packageDir, 'dist'), { recursive: true })
  writeFileSync(join(packageDir, 'dist', 'serve-sim.js'), '')
  vi.stubGlobal('process', { ...process, platform: 'darwin', resourcesPath: root })
  const result = resolveServeSimExecutable()
  expect(materialize).toHaveBeenCalledWith(
    expect.objectContaining({ bundledPackageDir: packageDir })
  )
  expect(result.baseArgs).toEqual([join('/materialized/simulator', 'dist', 'serve-sim.js')])
  expect(result.usesElectronAsNode).toBe(true)
})
