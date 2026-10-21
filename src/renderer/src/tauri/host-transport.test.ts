import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as HostTransport from './host-transport'

const native = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }))

let transport: typeof HostTransport

beforeEach(async () => {
  vi.resetModules()
  native.listen.mockReset().mockResolvedValue(() => {})
  native.invoke.mockReset().mockImplementation(async (_command, args) => {
    if (args.channel === 'desktop:bootstrap') {
      return { platform: 'darwin', version: 'test', settings: { theme: 'dark' } }
    }
    return null
  })
  transport = await import('./host-transport')
  await transport.initializeHostTransport()
  native.invoke.mockClear()
})

describe('Tauri save barrier', () => {
  it('retains a failed checkpoint so the user can retry closing without losing state', async () => {
    const snapshot = { sessions: [], ui: { activeView: 'workspace' } }
    transport.ipcRenderer.sendSync('app:stage-before-unload-sync', snapshot)
    native.invoke.mockRejectedValueOnce(new Error('disk full'))
    await expect(transport.flushHostWrites()).rejects.toThrow('disk full')
    await transport.flushHostWrites()
    expect(native.invoke.mock.calls.map(([, args]) => args.channel)).toEqual([
      'desktop:stage-checkpoint',
      'desktop:stage-checkpoint',
      'desktop:flush'
    ])
    expect(native.invoke.mock.calls[1][1].args).toEqual([snapshot])
  })

  it('flushes older session writes before the final shutdown checkpoint', async () => {
    transport.ipcRenderer.sendSync('session:set-sync', { old: true }, 'ssh:example')
    transport.ipcRenderer.sendSync('app:stage-before-unload-sync', { sessions: [], ui: {} })
    await transport.flushHostWrites()
    expect(native.invoke.mock.calls.map(([, args]) => args.channel)).toEqual([
      'session:set',
      'desktop:stage-checkpoint',
      'desktop:flush'
    ])
  })

  it('saves a checkpoint staged while an earlier checkpoint is being written', async () => {
    let finish: (value: unknown) => void = () => {}
    native.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    transport.ipcRenderer.sendSync('app:stage-before-unload-sync', { revision: 1 })
    const saving = transport.flushHostWrites()
    transport.ipcRenderer.sendSync('app:stage-before-unload-sync', { revision: 2 })
    finish(null)
    await saving
    expect(native.invoke.mock.calls[1][1].args).toEqual([{ revision: 2 }])
    expect(native.invoke.mock.calls.at(-1)?.[1].channel).toBe('desktop:flush')
  })

  it('hydrates referenced terminal scrollback before exposing the restored session', async () => {
    native.invoke.mockImplementation(async (_command, args) => {
      if (args.channel === 'session:get') {
        return { tabs: [{ layout: { scrollbackRefsByLeafId: { leaf: 'snapshot-1' } } }] }
      }
      return 'retained terminal output'
    })
    await transport.ipcRenderer.invoke('session:get')
    expect(
      transport.ipcRenderer.sendSync('session:read-terminal-scrollback-sync', { ref: 'snapshot-1' })
    ).toBe('retained terminal output')
  })
})
