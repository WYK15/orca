import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRgExecutable } from './ripgrep-executable'

vi.mock('node:fs', () => ({ existsSync: vi.fn() }))
vi.mock('./wsl', () => ({
  parseWslPath: (value: string) =>
    value.startsWith('\\\\wsl.localhost\\') ? { distro: 'Ubuntu' } : null
}))

beforeEach(() => vi.mocked(existsSync).mockReset().mockReturnValue(false))
afterEach(() => vi.unstubAllGlobals())

describe('ripgrep executable routing', () => {
  it.each(['darwin', 'linux', 'win32'])('prefers the packaged %s binary', (platform) => {
    vi.stubGlobal('process', { ...process, platform, resourcesPath: '/installed/resources' })
    const expected = join('/installed/resources', 'ripgrep', platform === 'win32' ? 'rg.exe' : 'rg')
    vi.mocked(existsSync).mockImplementation((value) => value === expected)
    expect(getRgExecutable('/workspace')).toBe(expected)
  })

  it('uses the pinned development binary when no packaged binary exists', () => {
    const root = dirname(dirname(require.resolve('@vscode/ripgrep-universal')))
    const expected = join(
      root,
      'bin',
      `${process.platform}-${process.arch}`,
      process.platform === 'win32' ? 'rg.exe' : 'rg'
    )
    vi.mocked(existsSync).mockImplementation((value) => value === expected)
    expect(getRgExecutable('/workspace')).toBe(expected)
  })

  it('retains system fallback for installs without bundled files', () => {
    expect(getRgExecutable('/workspace')).toBe('rg')
  })

  it('keeps both explicit WSL runtimes and UNC paths on the WSL host', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      resourcesPath: '/installed/resources'
    })
    vi.mocked(existsSync).mockReturnValue(true)
    expect(getRgExecutable('C:\\project', 'Ubuntu')).toBe('rg')
    expect(getRgExecutable('\\\\wsl.localhost\\Ubuntu\\project')).toBe('rg')
    expect(existsSync).not.toHaveBeenCalled()
  })
})
