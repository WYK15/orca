import { EventEmitter } from 'node:events'
import { dirname } from 'node:path'
import {
  desktopPath,
  nativeCall,
  sendDesktopEvent,
  unsupportedDesktopFeature
} from './desktop-context'
import { desktopWindow, renderer } from './ipc-port'
import metadata from '../../package.json'

export { ipcMain } from './ipc-port'

export const app = Object.assign(new EventEmitter(), {
  isPackaged: false,
  name: 'Orcaw Tauri',
  getPath: desktopPath,
  getAppPath: () => process.env.ORCA_TAURI_APP_ROOT ?? dirname(process.argv[1]),
  getName: () => 'Orcaw Tauri',
  getVersion: () => metadata.version,
  getLocale: () => Intl.DateTimeFormat().resolvedOptions().locale,
  isReady: () => true,
  whenReady: () => Promise.resolve(),
  getAppMetrics: () => [],
  getLoginItemSettings: () => ({ openAtLogin: false }),
  dock: { setBadge: () => {}, bounce: () => 0, cancelBounce: () => {} },
  quit: () => sendDesktopEvent('window:close-requested', { isQuitting: true }),
  exit: () => sendDesktopEvent('window:close-requested', { isQuitting: true })
})

// These identities represent the one trusted Tauri window, never browser panes.
export const BrowserWindow = {
  getAllWindows: () => [desktopWindow],
  getFocusedWindow: () => desktopWindow,
  fromId: (id: number) => (id === 1 ? desktopWindow : null),
  fromWebContents: (contents: { id: number }) => (contents.id === 1 ? desktopWindow : null)
}
export const webContents = {
  fromId: (id: number) => (id === 1 ? renderer : null),
  getAllWebContents: () => [renderer]
}
export const powerMonitor = new EventEmitter()
export const nativeTheme = Object.assign(new EventEmitter(), {
  shouldUseDarkColors: false,
  themeSource: 'system'
})

export const net = { fetch: globalThis.fetch.bind(globalThis) }
export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: () => unsupportedDesktopFeature('credential encryption'),
  decryptString: () => unsupportedDesktopFeature('Electron credential decryption')
}

export const shell = {
  openExternal: (url: string) => nativeCall('open-url', url),
  openPath: async (path: string) => {
    await nativeCall('open-path', path)
    return ''
  },
  showItemInFolder: (path: string) => {
    void nativeCall('reveal-path', path).catch(console.error)
  },
  trashItem: (path: string) => nativeCall('trash-path', path)
}

export const dialog = {
  showOpenDialog: async (...args: unknown[]) => {
    const options = args.at(-1)
    const paths = (await nativeCall('open-dialog', options)) as string[] | null
    return { canceled: !paths?.length, filePaths: paths ?? [] }
  },
  showSaveDialog: async (...args: unknown[]) => {
    const path = (await nativeCall('save-dialog', args.at(-1))) as string | null
    return { canceled: !path, filePath: path ?? undefined }
  },
  showMessageBox: () => unsupportedDesktopFeature('native message boxes')
}

export const clipboard = {
  readText: () => unsupportedDesktopFeature('synchronous native clipboard reads'),
  writeText: () => unsupportedDesktopFeature('synchronous native clipboard writes')
}
export const session = {
  fromPartition: () => unsupportedDesktopFeature('Chromium browser sessions'),
  get defaultSession(): never {
    return unsupportedDesktopFeature('Chromium browser sessions')
  }
}
export class Notification extends EventEmitter {
  static isSupported(): boolean {
    return false
  }
  show(): never {
    return unsupportedDesktopFeature('native notifications')
  }
}
export const nativeImage = {
  createFromPath: () => unsupportedDesktopFeature('Electron native images'),
  createFromBuffer: () => unsupportedDesktopFeature('Electron native images'),
  createEmpty: () => unsupportedDesktopFeature('Electron native images')
}
export const Menu = { buildFromTemplate: () => unsupportedDesktopFeature('Electron menus') }
export const screen = {
  getAllDisplays: () => [],
  getPrimaryDisplay: () => unsupportedDesktopFeature('display capture')
}
export const protocol = {
  registerFileProtocol: () => unsupportedDesktopFeature('Electron protocols')
}
export const autoUpdater = new EventEmitter()
export const systemPreferences = {
  isTrustedAccessibilityClient: () => false,
  getMediaAccessStatus: () => 'not-determined'
}
export const desktopCapturer = { getSources: () => unsupportedDesktopFeature('screen capture') }
export const utilityProcess = {
  fork: () => unsupportedDesktopFeature('Electron utility processes')
}
export class BaseWindow {
  constructor() {
    unsupportedDesktopFeature('embedded browser windows')
  }
}
export class WebContentsView {
  constructor() {
    unsupportedDesktopFeature('embedded Chromium views')
  }
}
