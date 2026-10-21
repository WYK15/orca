import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  files: new Map(),
  commands: [],
  names: [],
  existing: null,
  uploaded: null
}))
vi.mock('node:fs', () => ({
  readFileSync: (path) => {
    if (!fixture.files.has(path)) {
      throw new Error(`Missing fixture: ${path}`)
    }
    return fixture.files.get(path)
  },
  readdirSync: () => fixture.names
}))
vi.mock('node:child_process', () => ({
  execFileSync: (command, args) => {
    fixture.commands.push([command, ...args])
    if (command === 'git') {
      return 'commit-1\n'
    }
    if (args[0] !== 'release') {
      throw new Error('Unexpected command')
    }
    if (args[1] === 'view') {
      if (args.includes('isDraft,isPrerelease')) {
        if (fixture.existing) {
          return JSON.stringify(fixture.existing)
        }
        throw Object.assign(new Error('Not found'), { stderr: 'release not found' })
      }
      if (args.includes('assets,isDraft')) {
        return JSON.stringify(fixture.uploaded)
      }
      return 'https://github.com/owner/repo/releases/tag/test\n'
    }
    return ''
  }
}))

const version = '1.4.165-wyk.22-tauri.1'
const zip = `Orcaw-Tauri-${version}-macos-arm64.zip`
const dmg = `Orcaw-Tauri-${version}-macos-arm64.dmg`
const directory = 'out/tauri-artifacts'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('RELEASE_TAG', `v${version}`)
  vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo')
  vi.stubEnv('RELEASE_CHANNEL', 'preview')
  fixture.files = new Map([
    ['package.json', JSON.stringify({ version })],
    ['src-tauri/tauri.conf.json', JSON.stringify({ version })],
    [`${directory}/${zip}`, Buffer.from('signed zip')],
    [`${directory}/${dmg}`, Buffer.from('signed dmg')]
  ])
  const sums = [zip, dmg].map(
    (name) =>
      `${createHash('sha256')
        .update(fixture.files.get(`${directory}/${name}`))
        .digest('hex')}  ${name}`
  )
  fixture.files.set(`${directory}/SHA256SUMS.txt`, `${sums.join('\n')}\n`)
  fixture.commands = []
  fixture.names = [zip, dmg, 'SHA256SUMS.txt']
  fixture.existing = null
  fixture.uploaded = { isDraft: true, assets: fixture.names.map((name) => ({ name })) }
})

describe('Tauri release publication gate', () => {
  const publish = () => import('./publish-tauri-release.mjs')
  const changedRelease = () =>
    fixture.commands.filter(
      (args) => args[0] === 'gh' && ['create', 'upload', 'edit'].includes(args[2])
    )

  it('uploads a complete draft before publishing as a prerelease without replacing Latest', async () => {
    await publish()
    expect(changedRelease().map((args) => args[2])).toEqual(['create', 'upload', 'edit'])
    expect(changedRelease()[0]).toEqual(
      expect.arrayContaining(['--draft', '--prerelease', '--latest=false', '--verify-tag'])
    )
    expect(changedRelease()[2]).toEqual(
      expect.arrayContaining(['--draft=false', '--prerelease', '--latest=false'])
    )
  })
  it('publishes a stable release only when requested, while retaining the Electron Latest release', async () => {
    vi.stubEnv('RELEASE_CHANNEL', 'stable')
    await publish()
    expect(changedRelease().map((args) => args[2])).toEqual(['create', 'upload', 'edit'])
    expect(changedRelease()[0]).toEqual(
      expect.arrayContaining(['--draft', '--prerelease=false', '--latest=false', '--verify-tag'])
    )
    expect(changedRelease()[0].some((arg) => arg.includes('Preview'))).toBe(false)
    expect(changedRelease()[2]).toEqual(
      expect.arrayContaining(['--draft=false', '--prerelease=false', '--latest=false'])
    )
  })
  it('rejects an invalid channel before modifying a release', async () => {
    vi.stubEnv('RELEASE_CHANNEL', 'stabel')
    await expect(publish()).rejects.toThrow('RELEASE_CHANNEL')
    expect(changedRelease()).toEqual([])
  })
  it.each(['preview', 'stable'])(
    'does not repurpose a different-channel %s draft',
    async (channel) => {
      vi.stubEnv('RELEASE_CHANNEL', channel)
      fixture.existing = { isDraft: true, isPrerelease: channel !== 'preview' }
      await expect(publish()).rejects.toThrow('different-channel')
      expect(changedRelease()).toEqual([])
    }
  )
  it('rejects tampered files before creating a release', async () => {
    fixture.files.set(`${directory}/${zip}`, Buffer.from('tampered'))
    await expect(publish()).rejects.toThrow('checksum mismatch')
    expect(changedRelease()).toEqual([])
  })
  it('rejects missing installers', async () => {
    fixture.names = [zip, 'SHA256SUMS.txt']
    await expect(publish()).rejects.toThrow('complete')
    expect(changedRelease()).toEqual([])
  })
  it('does not overwrite published releases', async () => {
    fixture.existing = { isDraft: false, isPrerelease: true }
    await expect(publish()).rejects.toThrow('overwrite')
    expect(changedRelease()).toEqual([])
  })
  it('leaves incomplete uploads in draft', async () => {
    fixture.uploaded.assets.pop()
    await expect(publish()).rejects.toThrow('incomplete')
    expect(changedRelease().map((args) => args[2])).toEqual(['create', 'upload'])
  })
})
