import type { Store } from '../main/persistence'
import { registerAppMenu, rebuildAppMenu } from '../main/menu/register-app-menu'
import { setMainUiLanguage } from '../main/i18n/main-i18n'
import { nativeCall, sendDesktopEvent } from './desktop-context'
import { ipcMain } from './ipc-port'
import type { KeybindingOverrides } from '../shared/keybindings'

export async function registerApplicationMenu(
  store: Store,
  getKeybindings: () => KeybindingOverrides
): Promise<void> {
  await setMainUiLanguage(store.getSettings().uiLanguage)
  registerAppMenu({
    appMenuLabel: 'Orcaw Tauri',
    onOpenSettings: () => sendDesktopEvent('ui:openSettings'),
    onOpenSetupGuide: () => sendDesktopEvent('ui:openSetupGuide'),
    onOpenFeatureTour: () => sendDesktopEvent('ui:openFeatureTour'),
    onOpenCrashReport: () => sendDesktopEvent('ui:openCrashReport'),
    onCheckForUpdates: () => {
      sendDesktopEvent('desktop:release-page')
    },
    onZoomIn: () => sendDesktopEvent('terminal:zoom', 'in'),
    onZoomOut: () => sendDesktopEvent('terminal:zoom', 'out'),
    onZoomReset: () => sendDesktopEvent('terminal:zoom', 'reset'),
    onToggleLeftSidebar: () => sendDesktopEvent('ui:toggleLeftSidebar'),
    onToggleRightSidebar: () => sendDesktopEvent('ui:toggleRightSidebar'),
    onToggleAppearance: (key) => {
      if (key === 'statusBarVisible') {
        sendDesktopEvent('ui:toggleStatusBar')
        return
      }
      const settings = store.getSettings()
      const value = !(settings[key] !== false)
      const updated = store.updateSettings({ [key]: value }, { notifyListeners: true })
      sendDesktopEvent('settings:changed', updated)
    },
    getAppearanceState: () => {
      const settings = store.getSettings()
      return {
        showTasksButton: settings.showTasksButton !== false,
        showAutomationsButton: settings.showAutomationsButton !== false,
        showMobileButton: false,
        showTitlebarAppName: settings.showTitlebarAppName !== false,
        statusBarVisible: store.getUI().statusBarVisible !== false
      }
    },
    getKeybindings
  })
  let statusBarVisible = store.getUI().statusBarVisible
  store.onUIChanged((state) => {
    if (statusBarVisible !== state.statusBarVisible) {
      statusBarVisible = state.statusBarVisible
      rebuildAppMenu()
    }
  })
  store.onSettingsChanged((updates) => {
    if ('uiLanguage' in updates) {
      void setMainUiLanguage(store.getSettings().uiLanguage)
        .then(rebuildAppMenu)
        .catch(console.error)
    } else {
      rebuildAppMenu()
    }
  })
  ipcMain.on('window:show-app-menu', () => sendDesktopEvent('desktop:show-menu'))
  ipcMain.handle('desktop:show-menu', () => nativeCall('menu-popup'))
  ipcMain.handle('desktop:release-page', () =>
    nativeCall('open-url', 'https://github.com/WYK15/orca/releases')
  )
}
