import { EventEmitter } from 'node:events'
import { sendDesktopEvent } from './desktop-context'

export const renderer = Object.assign(new EventEmitter(), {
  id: 1,
  isDestroyed: () => false,
  getType: () => 'window',
  getURL: () => 'tauri://localhost',
  send: sendDesktopEvent,
  isLoading: () => false,
  isLoadingMainFrame: () => false,
  focus: () => sendDesktopEvent('desktop:focus'),
  getOSProcessId: () => process.pid
})

export const desktopWindow = Object.assign(new EventEmitter(), {
  id: 1,
  webContents: renderer,
  isDestroyed: () => false,
  isVisible: () => true,
  isFocused: () => true,
  isMinimized: () => false,
  show: () => sendDesktopEvent('desktop:focus'),
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
