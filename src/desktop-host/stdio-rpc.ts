import { createInterface } from 'node:readline'
import { inspect } from 'node:util'
import { decodeDesktopValue, encodeDesktopValue } from '../shared/desktop-wire-codec'

export type HostFrame = {
  id?: number
  kind: string
  channel?: string
  args?: unknown[]
  value?: unknown
  error?: string
}

type Dispatch = (frame: HostFrame) => unknown | Promise<unknown>

export class StdioRpc {
  private sequence = 0
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(private readonly write: (frame: HostFrame) => void) {}

  async receive(frame: HostFrame, dispatch: Dispatch): Promise<void> {
    if (frame.kind === 'native-result') {
      const pending = frame.id === undefined ? undefined : this.pending.get(frame.id)
      if (!pending || frame.id === undefined) {
        return
      }
      this.pending.delete(frame.id)
      clearTimeout(pending.timer)
      if (frame.error) {
        pending.reject(new Error(frame.error))
      } else {
        pending.resolve(frame.value)
      }
      return
    }
    try {
      const value = await dispatch(frame)
      if (frame.id !== undefined) {
        this.write({ kind: 'result', id: frame.id, value })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (frame.id !== undefined) {
        this.write({ kind: 'result', id: frame.id, error: message })
      } else {
        console.error('[desktop-host]', message)
      }
    }
  }

  native(channel: string, args: unknown[] = []): Promise<unknown> {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Native operation timed out: ${channel}`))
      }, 120_000)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ kind: 'native', id, channel, args })
    })
  }

  emit(channel: string, ...args: unknown[]): void {
    this.write({ kind: 'event', channel, args })
  }

  close(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error('Desktop host disconnected'))
    }
    this.pending.clear()
  }
}

export function openStdioRpc(dispatch: Dispatch, onDisconnect: () => void): StdioRpc {
  const write = process.stdout.write.bind(process.stdout)
  // stdout is a protocol pipe; diagnostics must never enter it.
  for (const method of ['log', 'info', 'debug', 'warn'] as const) {
    console[method] = (...args: unknown[]) => {
      process.stderr.write(
        `${args.map((value) => (typeof value === 'string' ? value : inspect(value))).join(' ')}\n`
      )
    }
  }
  const rpc = new StdioRpc((frame) => write(`${JSON.stringify(encodeDesktopValue(frame))}\n`))
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  lines.on('line', (line) => {
    try {
      const frame: unknown = JSON.parse(line)
      if (!frame || typeof frame !== 'object' || !('kind' in frame)) {
        throw new Error('Invalid desktop host frame')
      }
      void rpc.receive(decodeDesktopValue(frame) as HostFrame, dispatch)
    } catch (error) {
      console.error('[desktop-host] Invalid protocol input', error)
    }
  })
  lines.on('close', () => {
    rpc.close()
    onDisconnect()
  })
  return rpc
}
