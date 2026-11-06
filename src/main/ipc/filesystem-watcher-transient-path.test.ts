import { resolve, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Event as WatcherEvent } from '@parcel/watcher'
import { WATCH_BATCH_TRAILING_MS } from '../../shared/filesystem-watch-batch-window'

const { handle, subscribe, stat } = vi.hoisted(() => ({
  handle: vi.fn(),
  subscribe: vi.fn(),
  stat: vi.fn()
}))
vi.mock('electron', () => ({ ipcMain: { handle } }))
vi.mock('node:fs/promises', () => ({ stat }))
vi.mock('@parcel/watcher', () => ({ subscribe }))
vi.mock('./filesystem-watcher-wsl', () => ({ createWslWatcher: vi.fn() }))
vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: vi.fn(),
  onSshFilesystemProviderRegistered: () => () => {}
}))
import { closeAllWatchers, registerFilesystemWatcherHandlers } from './filesystem-watcher'

afterEach(async () => {
  await closeAllWatchers()
  vi.useRealTimers()
})

describe('transient local filesystem changes', () => {
  it('emits a final delete when a directory listing may have seen a file created during the same batch', async () => {
    const handlers = new Map<string, (event: unknown, args: unknown) => unknown>()
    handle.mockImplementation((channel, handler) => handlers.set(channel, handler))
    stat.mockResolvedValue({ isDirectory: () => true })
    let notify!: (error: Error | null, events: WatcherEvent[]) => void
    subscribe.mockImplementation(async (_root, listener) => {
      notify = listener
      return { unsubscribe: vi.fn() }
    })
    registerFilesystemWatcherHandlers()
    await closeAllWatchers()
    vi.useFakeTimers()
    const root = resolve('/tmp/transient-watch')
    const file = join(root, 'transient.txt')
    const sender = { id: 1, isDestroyed: () => false, send: vi.fn(), once: vi.fn() }
    await handlers.get('fs:watchWorktree')!({ sender }, { worktreePath: root })
    notify(null, [{ type: 'create', path: file }])
    await vi.advanceTimersByTimeAsync(10)
    notify(null, [{ type: 'delete', path: file }])
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_TRAILING_MS)
    expect(sender.send).toHaveBeenCalledWith('fs:changed', {
      worktreePath: root,
      events: [{ kind: 'delete', absolutePath: file, isDirectory: undefined }]
    })
  })
})
