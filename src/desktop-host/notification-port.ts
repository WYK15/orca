import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { nativeCall } from './desktop-context'
import { ipcMain } from './ipc-port'

type NotificationOptions = { title: string; body?: string; silent?: boolean; sound?: string }
const notifications = new Map<string, DesktopNotification>()

export class DesktopNotification extends EventEmitter {
  private readonly id = randomUUID()
  private closed = false
  private releaseTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly options: NotificationOptions) {
    super()
  }

  static isSupported(): boolean {
    return process.platform === 'darwin'
  }

  show(): void {
    if (this.closed || notifications.has(this.id)) {
      return
    }
    notifications.set(this.id, this)
    this.releaseTimer = setTimeout(() => this.release(), 5 * 60_000)
    this.releaseTimer.unref()
    void nativeCall('notification-show', { ...this.options, id: this.id }).then(
      () => {
        if (this.closed) {
          void nativeCall('notification-dismiss', this.id).catch(console.error)
        } else {
          this.emit('show')
        }
      },
      (error) => {
        if (!this.closed) {
          this.emit('failed', {}, String(error))
        }
        this.release()
      }
    )
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.release()
    void nativeCall('notification-dismiss', this.id).catch(console.error)
    this.emit('close')
  }

  private release(): void {
    this.closed = true
    notifications.delete(this.id)
    clearTimeout(this.releaseTimer)
  }
}

ipcMain.on('desktop:notification', (_event, id: string, action: string) => {
  const notification = notifications.get(id)
  if (!notification) {
    return
  }
  if (action === 'click') {
    notification.emit('click')
  }
  notification.close()
})
