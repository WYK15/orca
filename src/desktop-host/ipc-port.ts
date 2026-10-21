import { EventEmitter } from 'node:events'
import { sendDesktopEvent } from './desktop-context'
import { notifyMainWindowBecameVisible } from '../main/window/main-window-visibility'

const windowState = { focused: false, visible: false, minimized: false }

export const renderer = Object.assign(new EventEmitter(), {
  id: 1,
  isDestroyed: () => false,
  getType: () => 'window',
  getURL: () => 'tauri://localhost',
  send: sendDesktopEvent,
  isLoading: () => false,
  isLoadingMainFrame: () => false,
  focus: () => sendDesktopEvent('desktop:focus'),
  getOSProcessId: () => process.pid,
  reload: () => sendDesktopEvent('desktop:reload'),
  reloadIgnoringCache: () => sendDesktopEvent('desktop:reload')
})

export const desktopWindow = Object.assign(new EventEmitter(), {
  id: 1,
  webContents: renderer,
  isDestroyed: () => false,
  isVisible: () => windowState.visible,
  isFocused: () => windowState.focused,
  isMinimized: () => windowState.minimized,
  show: () => sendDesktopEvent('desktop:focus'),
  restore: () => sendDesktopEvent('desktop:focus'),
  focus: () => sendDesktopEvent('desktop:focus')
})

type IpcEvent = {
  sender: typeof renderer
  senderFrame: { url: string }
  returnValue?: unknown
  reply: (channel: string, ...args: unknown[]) => void
}
type Handler = (event: IpcEvent, ...args: never[]) => unknown

class DesktopIpc extends EventEmitter {
  private handlers = new Map<string, Handler>()

  handle(channel: string, handler: Handler): void {
    if (this.handlers.has(channel)) {
      throw new Error(`Duplicate IPC handler: ${channel}`)
    }
    this.handlers.set(channel, handler)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  async dispatch(kind: string, channel: string, args: unknown[] = []): Promise<unknown> {
    const event: IpcEvent = {
      sender: renderer,
      senderFrame: { url: renderer.getURL() },
      reply: sendDesktopEvent
    }
    if (kind === 'invoke') {
      const handler = this.handlers.get(channel)
      if (!handler) {
        throw new Error(`Tauri IPC channel has not been migrated: ${channel}`)
      }
      return await handler(event, ...(args as never[]))
    }
    const handled = this.emit(channel, event, ...args)
    if (kind === 'sync' && !handled) {
      throw new Error(`Unknown sync IPC channel: ${channel}`)
    }
    return event.returnValue
  }
}

export const ipcMain = new DesktopIpc()

ipcMain.on('desktop:window-state', (_event, next: typeof windowState) => {
  const wasVisible = windowState.visible && !windowState.minimized
  const wasFocused = windowState.focused
  windowState.focused = next.focused === true
  windowState.visible = next.visible === true
  windowState.minimized = next.minimized === true
  if (!wasVisible && windowState.visible && !windowState.minimized) {
    notifyMainWindowBecameVisible()
    desktopWindow.emit('show')
  }
  if (wasFocused !== windowState.focused) {
    desktopWindow.emit(windowState.focused ? 'focus' : 'blur')
    if (windowState.focused) {
      sendDesktopEvent('aiVault:windowFocused')
    }
  }
})
