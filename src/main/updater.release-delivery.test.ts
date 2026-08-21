import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../shared/update-status-types'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const {
  appMock,
  autoUpdaterMock,
  nativeUpdaterMock,
  killAllPtyMock,
  fetchNewerReleaseTagsMock,
  chooseLocalBuildMock,
  moduleFactories,
  resetUpdaterMocks
} = await vi.hoisted(async () => (await import('./updater-test-harness')).createUpdaterMocks())

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('@electron-toolkit/utils', () => moduleFactories.electronToolkitUtils())
vi.mock('./ipc/pty', () => moduleFactories.ipcPty())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

const roots: string[] = []
const version = '1.4.218-wyk.2'
const releaseUrl = `https://github.com/WYK15/orca/releases/tag/v${version}`
warmUpdaterModule()

function packageMetadata(metadata: Record<string, unknown>): void {
  const root = mkdtempSync(join(tmpdir(), 'orcaw-service-delivery-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify(metadata))
  appMock.getAppPath.mockReturnValue(root)
}

async function start(platform: NodeJS.Platform, metadata: Record<string, unknown>) {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  packageMetadata(metadata)
  fetchNewerReleaseTagsMock.mockResolvedValue([`v${version}`])
  autoUpdaterMock.checkForUpdates.mockImplementation(() => {
    autoUpdaterMock.emit('checking-for-update')
    autoUpdaterMock.emit('update-available', { version })
    return Promise.resolve(undefined)
  })
  autoUpdaterMock.downloadUpdate.mockResolvedValue([])
  const send = vi.fn()
  const updater = await loadUpdaterModule()
  updater.setupAutoUpdater({ webContents: { send } } as never, {
    getLastUpdateCheckAt: () => Date.now()
  })
  updater.checkForUpdatesFromMenu()
  await vi.advanceTimersByTimeAsync(0)
  return { updater, send }
}

describe('fork updater service delivery', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each(['darwin', 'win32'] as const)(
    'keeps unsigned %s offers manual at every public boundary',
    async (platform) => {
      const { updater, send } = await start(platform, {})
      expect(updater.getUpdateStatus()).toEqual({
        state: 'available',
        version,
        changelog: null,
        delivery: 'manual',
        releaseUrl
      })
      expect(autoUpdaterMock.autoDownload).toBe(false)
      expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false)
      updater.downloadUpdate()
      updater.quitAndInstall()
      await vi.advanceTimersByTimeAsync(100)
      expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
      expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
      expect(killAllPtyMock).not.toHaveBeenCalled()
      expect(send).toHaveBeenCalledWith('updater:quitAndInstallAborted')
      expect(updater.getRemoteServerUpdateSupport()).toMatchObject({
        automatic: false,
        reason: 'manual-service-update-required'
      })
      expect(() => updater.downloadRemoteServerUpdate('runtime-1')).toThrow(
        'remote_update_manual_required'
      )
      expect(() => updater.installRemoteServerUpdate('runtime-1')).toThrow(
        'remote_update_manual_required'
      )
      // A stale/pre-staged downloaded event must not turn a manual offer into an install action.
      autoUpdaterMock.emit('download-progress', { percent: 100 })
      autoUpdaterMock.emit('update-downloaded', { version })
      if (platform === 'darwin') {
        const ready = nativeUpdaterMock.on.mock.calls.find(
          ([name]) => name === 'update-downloaded'
        )?.[1] as () => void
        ready()
        const preventDefault = vi.fn()
        appMock.emit('before-quit', { preventDefault })
        expect(preventDefault).not.toHaveBeenCalled()
      }
      expect(updater.getUpdateStatus()).toMatchObject({ state: 'available', delivery: 'manual' })
    }
  )

  it.each(['darwin', 'win32', 'linux'] as const)(
    'keeps signed macOS automatic downloads and explicit downloads on %s',
    async (platform) => {
      const { updater } = await start(platform, { orcawReleaseAutoUpdate: true })
      expect(updater.getUpdateStatus()).toEqual({ state: 'available', version, changelog: null })
      expect(autoUpdaterMock.autoDownload).toBe(platform === 'darwin')
      updater.downloadUpdate()
      autoUpdaterMock.emit('update-downloaded', { version })
      if (platform === 'darwin') {
        const ready = nativeUpdaterMock.on.mock.calls.find(
          ([name]) => name === 'update-downloaded'
        )?.[1] as () => void
        ready()
      }
      expect(updater.getUpdateStatus()).toEqual({ state: 'downloaded', version, releaseUrl })
      updater.quitAndInstall()
      await vi.advanceTimersByTimeAsync(100)
      expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1)
      expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledTimes(1)
    }
  )

  it('keeps Linux automatic without signing metadata', async () => {
    const { updater } = await start('linux', {})
    updater.downloadUpdate()
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(updater.getRemoteServerUpdateSupport().automatic).toBe(true)
  })

  it('pins both initial and unresolved fallback feeds to the fork', async () => {
    const { updater } = await start('win32', {})
    expect(autoUpdaterMock.setFeedURL).toHaveBeenNthCalledWith(1, {
      provider: 'generic',
      url: 'https://github.com/WYK15/orca/releases/latest/download'
    })
    fetchNewerReleaseTagsMock.mockResolvedValue({ tags: [], state: 'unavailable' })
    updater.checkForUpdatesFromMenu()
    await vi.advanceTimersByTimeAsync(0)
    expect(autoUpdaterMock.setFeedURL).toHaveBeenLastCalledWith({
      provider: 'generic',
      url: 'https://github.com/WYK15/orca/releases/latest/download'
    })
  })

  it.each([
    ['hourly', '1.4.218-hourly.202607281400'],
    ['adhoc', '1.4.218-adhoc.20260728140533']
  ] as const)(
    'keeps an unsigned %s jump manual with its exact tag link',
    async (channel, targetVersion) => {
      const { updater } = await start('darwin', {})
      autoUpdaterMock.checkForUpdates.mockImplementation(() => {
        autoUpdaterMock.emit('checking-for-update')
        autoUpdaterMock.emit('update-available', { version: targetVersion })
        return Promise.resolve(undefined)
      })
      updater.checkForUpdatesFromMenu({ channel, targetTag: `v${targetVersion}` })
      await vi.advanceTimersByTimeAsync(0)
      expect(autoUpdaterMock.setFeedURL).toHaveBeenLastCalledWith({
        provider: 'generic',
        url: `https://github.com/WYK15/orca/releases/download/v${targetVersion}`
      })
      expect(updater.getUpdateStatus()).toMatchObject({
        state: 'available',
        delivery: 'manual',
        source: channel,
        releaseUrl: `https://github.com/WYK15/orca/releases/tag/v${targetVersion}`
      })
      updater.downloadUpdate()
      expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    }
  )

  it('preserves validated local builds on manual macOS hosts', async () => {
    const { updater } = await start('darwin', {})
    chooseLocalBuildMock.mockResolvedValue({
      version: '0.9.0-local.1',
      manifestContent: '',
      artifacts: new Map()
    })
    autoUpdaterMock.checkForUpdates.mockImplementation(() => {
      autoUpdaterMock.emit('checking-for-update')
      autoUpdaterMock.emit('update-available', { version: '0.9.0-local.1' })
      return Promise.resolve(undefined)
    })
    updater.checkForUpdatesFromMenu({ localBuild: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(updater.getUpdateStatus()).toMatchObject({ state: 'available', source: 'local' })
    expect(updater.getUpdateStatus()).not.toHaveProperty('delivery')
    updater.downloadUpdate()
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('blocks retry and native staging entry points even with a cached version', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    packageMetadata({ orcawReleaseAutoUpdate: false })
    const { UpdaterSetup } = await import('./updater/updater-setup')
    class Probe extends UpdaterSetup {
      seed(status: UpdateStatus): void {
        this.currentStatus = status
        this.availableVersion = version
      }
      executeInstall(): Promise<void> {
        return this.performQuitAndInstall()
      }
    }
    const updater = new Probe()
    const send = vi.fn()
    updater.setupAutoUpdater({ webContents: { send } } as never, {
      getLastUpdateCheckAt: () => Date.now()
    })
    autoUpdaterMock.downloadUpdate.mockResolvedValue([])
    updater.seed({ state: 'error', message: 'download failed' })
    updater.downloadUpdate()
    updater.seed({ state: 'downloaded', version })
    await updater.executeInstall()
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('updater:quitAndInstallAborted')
    expect(updater.isQuittingForUpdate()).toBe(false)
  })
})
