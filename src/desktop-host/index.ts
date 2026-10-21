import { mkdirSync } from 'node:fs'
import { release } from 'node:os'
import { Store } from '../main/persistence'
import { hydrateShellPath, mergePathSegments } from '../main/startup/hydrate-shell-path'
import { closeAllWatchers } from '../main/ipc/filesystem-watcher'
import { killAllPty } from '../main/ipc/pty'
import { disconnectRegisteredSshTarget, listRegisteredSshTargets } from '../main/ipc/ssh'
import { registerRendererShutdownCheckpointHandler } from '../main/ipc/renderer-shutdown-checkpoint'
import { desktopPath, nativeCall, setDesktopTransport } from './desktop-context'
import { clearCredentialEncryption, initializeCredentialEncryption } from './credential-encryption'
import { ipcMain, renderer } from './ipc-port'
import { openStdioRpc, type HostFrame } from './stdio-rpc'
import { registerWorkspaceHandlers } from './register-workspace-handlers'
import { registerServiceHandlers } from './register-service-handlers'
import { registerUnavailableCapabilities } from './register-unavailable-capabilities'
import metadata from '../../package.json'
import { registerClipboardHandlers } from './clipboard-handlers'
import { registerApplicationMenu } from './register-application-menu'

let store: Store | undefined
let stopping = false
const cleanup: (() => Promise<void>)[] = []
const ready = initialize()

const transport = openStdioRpc(
  async (frame: HostFrame) => {
    await ready
    if (frame.channel === 'desktop:bootstrap') {
      return {
        platform: process.platform,
        osRelease: release(),
        version: metadata.version,
        settings: store!.getSettings()
      }
    }
    if (frame.channel === 'desktop:flush') {
      await store!.flushPendingAsync()
      store!.flushOrThrow()
      return
    }
    if (!frame.channel || !['invoke', 'send', 'sync'].includes(frame.kind)) {
      throw new Error('Invalid desktop IPC request')
    }
    return ipcMain.dispatch(frame.kind, frame.channel, frame.args)
  },
  () => {
    void shutdown()
  }
)
setDesktopTransport(transport)

async function initialize(): Promise<void> {
  mkdirSync(desktopPath('userData'), { recursive: true })
  // Defer initialization until stdout belongs exclusively to the RPC transport.
  await Promise.resolve()
  initializeCredentialEncryption(await nativeCall('credential-key'))
  process.env.ORCA_APP_VERSION = metadata.version
  if (process.env.ORCA_TAURI_RESOURCES) {
    Object.defineProperty(process, 'resourcesPath', { value: process.env.ORCA_TAURI_RESOURCES })
  }
  const hydrated = await hydrateShellPath()
  if (hydrated.ok) {
    mergePathSegments(hydrated.segments)
  }
  store = new Store()
  const workspace = registerWorkspaceHandlers(store)
  cleanup.push(workspace.shutdown)
  const services = registerServiceHandlers(store, workspace.runtime)
  cleanup.push(services.shutdown)
  registerRendererShutdownCheckpointHandler(store)
  registerDesktopHandlers(store, workspace.firstWindowReady)
  registerClipboardHandlers(store)
  await registerApplicationMenu(store, () => services.keybindings.getOverrides())
  registerUnavailableCapabilities(metadata.version)
  renderer.emit('did-finish-load')
}

function registerDesktopHandlers(state: Store, firstWindowReady: Promise<void>): void {
  ipcMain.handle('app:getIdentity', () => ({
    name: 'Orcaw Tauri',
    isDev: true,
    devLabel: 'Tauri',
    devBranch: null,
    devWorktreeName: null,
    devRepoRoot: null,
    dockBadgeLabel: null
  }))
  ipcMain.handle('app:awaitFirstWindowStartupServices', () => firstWindowReady)
  ipcMain.handle('app:recoverLegacyWorkerTerminalsForRendererStartup', () => undefined)
  ipcMain.handle('app:getKeyboardInputSourceId', () => null)
  ipcMain.handle('app:setUnreadDockBadgeCount', () => undefined)
  ipcMain.handle('app:getFeatureWallAssetBaseUrl', () => './onboarding/feature-wall/')
  ipcMain.handle('app:getFloatingTerminalCwd', () => desktopPath('home'))
  ipcMain.handle('app:getFloatingMarkdownDirectory', () => desktopPath('documents'))
  ipcMain.handle('app:startupDiagnostic', () => undefined)
  ipcMain.handle('desktop:stage-checkpoint', async (_event, args) => {
    const result = (await ipcMain.dispatch('sync', 'app:stage-before-unload-sync', [args])) as {
      ok: boolean
    }
    if (!result.ok) {
      throw new Error('Failed to stage renderer checkpoint')
    }
    await state.flushPendingAsync()
    state.flushOrThrow()
  })
}

async function shutdown(): Promise<void> {
  if (stopping) {
    return
  }
  stopping = true
  const forceExit = setTimeout(() => process.exit(1), 5_000)
  forceExit.unref()
  try {
    await ready.catch(() => {})
    await closeAllWatchers()
    await Promise.allSettled(cleanup.map((stop) => stop()))
    await Promise.allSettled(
      listRegisteredSshTargets().map((target) => disconnectRegisteredSshTarget(target.id))
    )
    killAllPty()
    await store?.flushPendingAsync()
    store?.flushOrThrow()
    clearCredentialEncryption()
    process.exit(0)
  } catch (error) {
    console.error('[desktop-host] Shutdown failed', error)
    process.exit(1)
  }
}

process.once('SIGTERM', () => {
  void shutdown()
})
process.once('SIGINT', () => {
  void shutdown()
})
void ready.catch((error) => console.error('[desktop-host] Startup failed', error))
