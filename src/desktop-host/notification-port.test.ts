import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { DesktopNotification } from './notification-port'

const { nativeCall, ipcMain } = vi.hoisted(() => ({
  nativeCall: vi.fn(),
  ipcMain: new (class {
    listeners = new Map<string, (...args: unknown[]) => void>()
    on(channel: string, callback: (...args: unknown[]) => void) {
      this.listeners.set(channel, callback)
    }
  })()
}))
vi.mock('./desktop-context', () => ({ nativeCall }))
vi.mock('./ipc-port', () => ({ ipcMain }))

describe('native notification lifetime', () => {
  afterEach(() => {
    nativeCall.mockReset()
    vi.useRealTimers()
  })

  it('reports submission failures without reporting show', async () => {
    nativeCall.mockRejectedValueOnce(new Error('macOS denied delivery'))
    const notification = new DesktopNotification({ title: 'test' })
    const shown = vi.fn()
    notification.on('show', shown)
    const failed = new Promise<unknown[]>((resolve) =>
      notification.once('failed', (...args) => resolve(args))
    )
    notification.show()
    expect(await failed).toEqual([{}, 'Error: macOS denied delivery'])
    expect(shown).not.toHaveBeenCalled()
  })

  it('dismisses again if closed before macOS accepts the pending request', async () => {
    let accept: (() => void) | undefined
    nativeCall.mockImplementation((channel) =>
      channel === 'notification-show'
        ? new Promise<void>((resolve) => {
            accept = resolve
          })
        : Promise.resolve()
    )
    const notification = new DesktopNotification({ title: 'test' })
    const shown = vi.fn()
    notification.on('show', shown)
    notification.show()
    notification.close()
    accept?.()
    await Promise.resolve()
    expect(nativeCall.mock.calls.map(([channel]) => channel)).toEqual([
      'notification-show',
      'notification-dismiss',
      'notification-dismiss'
    ])
    expect(shown).not.toHaveBeenCalled()
  })

  it('routes clicks once and releases expired callbacks', async () => {
    vi.useFakeTimers()
    nativeCall.mockResolvedValue(undefined)
    const notification = new DesktopNotification({ title: 'test' })
    expect(notification).toBeInstanceOf(EventEmitter)
    const clicked = vi.fn()
    notification.on('click', clicked)
    notification.show()
    notification.show()
    await Promise.resolve()
    expect(nativeCall).toHaveBeenCalledTimes(1)
    const id = nativeCall.mock.calls[0][1].id
    const emit = () => ipcMain.listeners.get('desktop:notification')?.({}, id, 'click')
    emit()
    emit()
    expect(clicked).toHaveBeenCalledTimes(1)
    const expired = new DesktopNotification({ title: 'expired' })
    expired.on('click', clicked)
    expired.show()
    const expiredId = nativeCall.mock.calls.at(-1)?.[1].id
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    ipcMain.listeners.get('desktop:notification')?.({}, expiredId, 'click')
    expect(clicked).toHaveBeenCalledTimes(1)
  })
})
