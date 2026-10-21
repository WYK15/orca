import { getCurrentWindow } from '@tauri-apps/api/window'
import { toast } from 'sonner'
import { translate } from '../i18n/i18n'
import { createWindowSaveBarrier } from './window-close-barrier'
import { pasteFromMenu } from './menu-paste'
import { installTitlebarDrag } from './titlebar-drag'
import { installFileDrop } from './file-drop'
import {
  dispatchHostEvent,
  flushHostWrites,
  initializeHostTransport,
  ipcRenderer
} from './host-transport'

async function startDesktop(): Promise<void> {
  const bootstrap = await initializeHostTransport()
  Object.assign(globalThis, {
    process: {
      platform: bootstrap.platform,
      env: {},
      versions: {},
      contextIsolated: true,
      getSystemVersion: () => bootstrap.osRelease
    }
  })
  await import('../../../preload/index')
  const window = getCurrentWindow()
  installTitlebarDrag(window)
  await installFileDrop()
  const save = createWindowSaveBarrier(globalThis.window, flushHostWrites, (error) => {
    console.error('Could not save before closing', error)
    toast.error(
      translate('app.closeSaveFailed', "Couldn't save before closing. Your window is still open.")
    )
  })
  const close = () => save(() => window.destroy())
  ipcRenderer.on('desktop:focus', () => {
    void window
      .unminimize()
      .then(() => window.show())
      .then(() => window.setFocus())
      .catch(console.error)
  })
  ipcRenderer.on('desktop:reload', () => {
    void save(async () => {
      globalThis.location.reload()
    })
  })
  ipcRenderer.on('desktop:show-menu', () => {
    void ipcRenderer.invoke('desktop:show-menu').catch(console.error)
  })
  ipcRenderer.on('desktop:release-page', () => {
    void ipcRenderer.invoke('desktop:release-page').catch(console.error)
  })
  await window.onCloseRequested((event) => {
    event.preventDefault()
    dispatchHostEvent('window:close-requested', { isQuitting: false })
  })
  const send = ipcRenderer.send
  ipcRenderer.send = (channel, ...args) => {
    switch (channel) {
      case 'window:confirm-close':
        void close()
        return
      case 'window:request-close':
        void window.close()
        return
      case 'window:minimize':
        void window.minimize()
        return
      case 'window:maximize':
        void window.toggleMaximize()
        return
      case 'ui:performNativePaste':
        void pasteFromMenu(
          () =>
            ipcRenderer.invoke('desktop:clipboard-payload') as Promise<{
              text: string
              png: string | null
            }>
        ).catch(console.error)
        return
      default:
        send(channel, ...args)
    }
  }
  const call = ipcRenderer.invoke
  ipcRenderer.invoke = (channel, ...args) =>
    channel === 'window:isMaximized' ? window.isMaximized() : call(channel, ...args)
  await import('../main')
  await window.show()
}

void startDesktop().catch((error) => {
  console.error('Tauri startup failed', error)
  const root = document.getElementById('root')
  if (root) {
    root.textContent = `Orcaw could not start. ${String(error)}`
  }
})
