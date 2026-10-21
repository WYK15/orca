import { describe, expect, it, vi } from 'vitest'
import { StdioRpc, type HostFrame } from './stdio-rpc'

describe('desktop native RPC lifecycle', () => {
  it('allows an awaiting native dialog to complete while the caller is still in flight', async () => {
    const frames: HostFrame[] = []
    const rpc = new StdioRpc((frame) => frames.push(frame))
    const request = rpc.receive({ id: 42, kind: 'invoke' }, () => rpc.native('open-dialog'))
    expect(frames[0]).toMatchObject({ kind: 'native', channel: 'open-dialog' })
    await rpc.receive({ kind: 'native-result', id: frames[0].id, value: ['/project'] }, vi.fn())
    await request
    expect(frames.at(-1)).toEqual({ id: 42, kind: 'result', value: ['/project'] })
  })

  it('rejects pending native operations when the shell disconnects', async () => {
    const rpc = new StdioRpc(vi.fn())
    const call = rpc.native('clipboard-read')
    const rejected = expect(call).rejects.toThrow('disconnected')
    rpc.close()
    await rejected
  })

  it('returns handler errors as failed RPC replies', async () => {
    const frames: HostFrame[] = []
    const rpc = new StdioRpc((frame) => frames.push(frame))
    await rpc.receive({ kind: 'invoke', id: 1 }, () => {
      throw new Error('Access denied')
    })
    expect(frames).toEqual([{ kind: 'result', id: 1, error: 'Access denied' }])
  })
})
