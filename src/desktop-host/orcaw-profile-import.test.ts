import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { importOrcawProfile } from './orcaw-profile-import'
import { findOrcawProfile } from './orcaw-profile-source'

let directory: string
let source: string
let target: string
const initial = {
  schemaVersion: 1,
  repos: [{ id: 'current', path: '/current' }],
  settings: { terminalFontSize: 12, opencodeSessionCookie: 'tauri-secret' },
  workspaceSession: { draft: 'unsaved -> text' }
}
const imported = {
  schemaVersion: 1,
  repos: [{ id: 'old', path: '/old' }],
  settings: { terminalFontSize: 17, uiLanguage: 'zh-CN', opencodeSessionCookie: 'electron-secret' }
}
const confirm = vi.fn(async () => true)

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orcaw-profile-import-test-'))
  source = join(directory, 'Orcaw')
  target = join(directory, 'Tauri')
  await mkdir(source)
  await mkdir(target)
  await writeFile(join(source, 'orca-data.json'), JSON.stringify(imported))
  await writeFile(join(target, 'orca-data.json'), JSON.stringify(initial))
  confirm.mockReset().mockResolvedValue(true)
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function run() {
  return importOrcawProfile({
    sourceDirectory: source,
    targetDirectory: target,
    home: directory,
    confirm
  })
}

describe('one-time Orcaw import', () => {
  it('backs up Tauri, preserves its drafts and credentials, and never modifies Orcaw', async () => {
    const originalSource = await readFile(join(source, 'orca-data.json'), 'utf8')
    await run()
    const result = JSON.parse(await readFile(join(target, 'orca-data.json'), 'utf8'))
    expect(result.repos).toEqual([...initial.repos, ...imported.repos])
    expect(result.settings).toMatchObject({
      terminalFontSize: 17,
      opencodeSessionCookie: 'tauri-secret'
    })
    expect(result.workspaceSession).toEqual(initial.workspaceSession)
    expect(await readFile(join(source, 'orca-data.json'), 'utf8')).toBe(originalSource)
    const marker = JSON.parse(await readFile(join(target, 'orcaw-profile-import.json'), 'utf8'))
    expect(marker).toMatchObject({ version: 1, importedRepos: 1, importedFolders: 0 })
    expect(JSON.parse(await readFile(marker.backup, 'utf8'))).toEqual(initial)
    expect((await stat(marker.backup)).mode & 0o777).toBe(0o600)
    expect((await readdir(target)).some((file) => file.endsWith('.tmp'))).toBe(false)
  })

  it('does not reapply Orcaw preferences after the user edits Tauri', async () => {
    await run()
    await writeFile(
      join(target, 'orca-data.json'),
      JSON.stringify({ ...initial, settings: { terminalFontSize: 24 } })
    )
    await run()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(await readFile(join(target, 'orca-data.json'), 'utf8')).settings.terminalFontSize
    ).toBe(24)
  })

  it('leaves all files intact when the user chooses Later', async () => {
    confirm.mockResolvedValue(false)
    await run()
    expect(JSON.parse(await readFile(join(target, 'orca-data.json'), 'utf8'))).toEqual(initial)
    expect(await readdir(target)).toEqual(['orca-data.json'])
    expect(await readdir(source)).toEqual(['orca-data.json'])
  })

  it('reads the active named profile rather than an obsolete root file', async () => {
    const profile = {
      id: 'active',
      name: 'Personal',
      kind: 'local',
      avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1
    }
    await writeFile(
      join(source, 'orca-profile-index.json'),
      JSON.stringify({ schemaVersion: 1, activeProfileId: 'active', profiles: [profile] })
    )
    await mkdir(join(source, 'profiles/active'), { recursive: true })
    await writeFile(
      join(source, 'profiles/active/orca-data.json'),
      JSON.stringify({ ...imported, repos: [{ id: 'active-project', path: '/active' }] })
    )
    await run()
    const result = JSON.parse(await readFile(join(target, 'orca-data.json'), 'utf8'))
    expect(result.repos).toContainEqual({ id: 'active-project', path: '/active' })
    expect(result.repos).not.toContainEqual(imported.repos[0])
  })

  it('imports settings into a fresh Tauri profile', async () => {
    await rm(join(target, 'orca-data.json'))
    await run()
    const result = JSON.parse(await readFile(join(target, 'orca-data.json'), 'utf8'))
    expect(result.settings.terminalFontSize).toBe(17)
    expect(result.settings.opencodeSessionCookie).not.toBe('electron-secret')
    expect(result.sshRemotePtyLeases).toEqual([])
  })

  it('rejects corrupt source and target data before writing a backup or destination', async () => {
    await writeFile(join(source, 'orca-data.json'), '{not JSON')
    await expect(run()).rejects.toThrow('not valid JSON')
    expect(confirm).not.toHaveBeenCalled()
    expect(await readdir(target)).toEqual(['orca-data.json'])
    expect(JSON.parse(await readFile(join(target, 'orca-data.json'), 'utf8'))).toEqual(initial)
  })

  it('rejects a corrupt profile index rather than selecting a different profile', async () => {
    await writeFile(join(source, 'orca-profile-index.json'), '{invalid')
    await expect(run()).rejects.toThrow('index is corrupt')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('rejects source profile symlinks escaping the Orcaw data directory', async () => {
    await rm(join(source, 'orca-data.json'))
    await symlink(join(target, 'orca-data.json'), join(source, 'orca-data.json'))
    await expect(findOrcawProfile(source)).rejects.toThrow('outside')
  })

  it('rejects sharing one data file between both applications', async () => {
    target = source
    await expect(run()).rejects.toThrow('separate data directories')
  })
})
