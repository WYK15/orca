// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DragEvent } from 'react'
import { startFileExplorerNativeDrag } from './file-explorer-native-drag'

const mocks = vi.hoisted(() => ({ start: vi.fn(), assert: vi.fn(), error: vi.fn(), active: 'one' }))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ activeWorktreeId: mocks.active }) }
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('./file-explorer-operation-owner', () => ({
  captureFileExplorerOperationGuard: () => ({ assertCurrent: mocks.assert })
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.active = 'one'
  Object.assign(window, { api: { ui: { startFileDrag: mocks.start } } })
})
afterEach(() => vi.restoreAllMocks())

describe('native explorer drag gestures', () => {
  function gesture(
    owner: { kind: 'local' } | { kind: 'ssh'; connectionId: string } = { kind: 'local' }
  ) {
    const event = { preventDefault: vi.fn() }
    const change = vi.fn()
    const handled = startFileExplorerNativeDrag(
      event as unknown as DragEvent,
      ['/project/a', '/project/b'],
      'one',
      owner,
      change
    )
    return { event, change, handled }
  }

  it('waits for WebKit cancellation before starting one native gesture for multiple files', async () => {
    let finish!: (result: { outcome: 'cancelled' }) => void
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const ended = vi.fn()
    document.addEventListener('dragend', ended, { once: true })
    const { event, change, handled } = gesture()
    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.start).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    expect(mocks.start).toHaveBeenCalledWith({
      paths: ['/project/a', '/project/b'],
      worktreeId: 'one'
    })
    finish({ outcome: 'cancelled' })
    await vi.waitFor(() => expect(change).toHaveBeenLastCalledWith(null))
    expect(ended).toHaveBeenCalledOnce()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('keeps HTML drag behavior for remote files and hosts without the native capability', () => {
    expect(gesture({ kind: 'ssh', connectionId: 'remote' }).handled).toBe(false)
    delete window.api.ui.startFileDrag
    const result = gesture()
    expect(result.handled).toBe(false)
    expect(result.event.preventDefault).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('rejects stale ownership before starting a native gesture', () => {
    mocks.assert.mockImplementation(() => {
      throw new Error('Workspace changed')
    })
    expect(gesture().handled).toBe(true)
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledOnce()
  })

  it('rechecks ownership after WebKit cancellation before handing files to macOS', async () => {
    gesture()
    mocks.assert.mockImplementation(() => {
      throw new Error('Workspace changed')
    })
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('does not clear another workspace selection when a gesture finishes late', async () => {
    let finish!: (value: { outcome: 'copied' }) => void
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const { change } = gesture()
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    mocks.active = 'two'
    finish({ outcome: 'copied' })
    await Promise.resolve()
    await Promise.resolve()
    expect(change).toHaveBeenCalledTimes(1)
    expect(change).toHaveBeenCalledWith('/project/a')
  })
})
