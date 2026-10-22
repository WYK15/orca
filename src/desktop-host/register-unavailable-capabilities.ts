import type { CliInstallStatus } from '../shared/cli-install-types'
import { ipcMain } from './ipc-port'

export function registerUnavailableCapabilities(version: string): void {
  ipcMain.handle('ssh:listTargets', () => [])
  ipcMain.handle('ssh:listRemovedTargetLabels', () => ({}))
  ipcMain.handle('runtimeEnvironments:list', () => [])
  ipcMain.handle('plugins:list', () => [])
  ipcMain.handle('plugins:listLanguagePacks', () => [])
  ipcMain.handle('linear:status', () => ({ connected: false, viewer: null }))
  ipcMain.handle('jira:status', () => ({ connected: false, viewer: null }))
  ipcMain.handle('jira:readStatus', () => ({ connected: false, viewer: null }))
  ipcMain.handle('ui:consumePendingOpenSettings', () => null)
  ipcMain.handle('mobile:consumePendingUnpairedDeviceAuthFailure', () => null)
  ipcMain.handle('macosTccPrompts:consumePending', () => null)
  ipcMain.handle('browser:session:listProfiles', () => [])
  ipcMain.handle('updater:getStatus', () => ({ state: 'idle' }))
  ipcMain.handle('updater:getVersion', () => version)
  ipcMain.handle(
    'cli:getInstallStatus',
    (): CliInstallStatus => ({
      platform: process.platform,
      commandName: 'orcaw',
      commandPath: null,
      pathDirectory: null,
      pathConfigured: null,
      launcherPath: null,
      installMethod: null,
      supported: false,
      state: 'unsupported',
      currentTarget: null,
      unsupportedReason: 'launch_mode_unavailable',
      detail: 'CLI installation is unavailable in the Tauri migration build.'
    })
  )
}
