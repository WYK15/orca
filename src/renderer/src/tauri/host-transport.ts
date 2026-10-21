import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { decodeDesktopValue, encodeDesktopValue } from '../../../shared/desktop-wire-codec'

type Listener = (event: unknown, ...args: unknown[]) => void
type Bootstrap = {
  platform: string
  osRelease: string
  version: string
  settings: Record<string, unknown>
}
const listeners = new Map<string, Set<Listener>>()
let bootstrap: Bootstrap
let checkpoint: unknown
const pendingSessions = new Map<string, unknown[]>()
const scrollback = new Map<string, string>()
const MAX_SCROLLBACK_BYTES = 64 * 1024 * 1024
let scrollbackBytes = 0

export async function initializeHostTransport(): Promise<Bootstrap> {
  await listen<{ channel: string; args: unknown[] }>('desktop:event', ({ payload }) => {
    if (payload.channel === 'settings:changed' && bootstrap) {
      Object.assign(bootstrap.settings, payload.args[0])
    }
    dispatchHostEvent(payload.channel, ...(decodeDesktopValue(payload.args) as unknown[]))
  })
  bootstrap = (await hostInvoke('desktop:bootstrap', [])) as Bootstrap
  return bootstrap
}

export function dispatchHostEvent(channel: string, ...args: unknown[]): void {
  const snapshot = Array.from(listeners.get(channel) ?? [])
  for (const listener of snapshot) {
    listener({}, ...args)
  }
}

export async function hostInvoke(
  channel: string,
  args: unknown[] = [],
  kind = 'invoke'
): Promise<unknown> {
  try {
    return decodeDesktopValue(
      await invoke('backend_call', { channel, args: encodeDesktopValue(args), kind })
    )
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export async function flushHostWrites(): Promise<void> {
  for (const [key, args] of pendingSessions) {
    await hostInvoke('session:set', args)
    if (pendingSessions.get(key) === args) {
      pendingSessions.delete(key)
    }
  }
  while (checkpoint) {
    const staged = checkpoint
    await hostInvoke('desktop:stage-checkpoint', [staged])
    if (checkpoint === staged) {
      checkpoint = undefined
    }
  }
  await hostInvoke('desktop:flush')
}

async function cacheScrollback(value: unknown): Promise<void> {
  const refs = new Set<string>()
  const collect = (entry: unknown): void => {
    if (!entry || typeof entry !== 'object') {
      return
    }
    for (const [key, child] of Object.entries(entry)) {
      if (key === 'scrollbackRefsByLeafId' && child && typeof child === 'object') {
        for (const ref of Object.values(child)) {
          if (typeof ref === 'string') {
            refs.add(ref)
          }
        }
      } else {
        collect(child)
      }
    }
  }
  collect(value)
  await Promise.all(
    Array.from(refs, async (ref) => {
      if (scrollback.has(ref)) {
        return
      }
      const buffer = await hostInvoke('session:read-terminal-scrollback-sync', [{ ref }], 'sync')
      if (typeof buffer === 'string') {
        const bytes = buffer.length * 2
        if (bytes > MAX_SCROLLBACK_BYTES) {
          return
        }
        while (scrollbackBytes + bytes > MAX_SCROLLBACK_BYTES || scrollback.size >= 128) {
          const oldest = scrollback.entries().next().value
          if (!oldest) {
            break
          }
          scrollback.delete(oldest[0])
          scrollbackBytes -= oldest[1].length * 2
        }
        scrollback.set(ref, buffer)
        scrollbackBytes += bytes
      }
    })
  )
}

export const ipcRenderer = {
  invoke: async (channel: string, ...args: unknown[]) => {
    const value = await hostInvoke(channel, args)
    if (channel === 'session:get') {
      await cacheScrollback(value)
    }
    if (channel === 'settings:get') {
      bootstrap.settings = value as Record<string, unknown>
    }
    if (channel === 'settings:set') {
      if (value && typeof value === 'object') {
        bootstrap.settings = value as Record<string, unknown>
      }
    }
    return value
  },
  send: (channel: string, ...args: unknown[]) => {
    void hostInvoke(channel, args, 'send').catch((error) =>
      console.error('[desktop-host]', channel, error)
    )
  },
  sendSync: (channel: string, ...args: unknown[]): unknown => {
    if (channel === 'settings:get-sync') {
      return bootstrap.settings
    }
    if (channel === 'app:stage-before-unload-sync') {
      // Tauri closes only after flushHostWrites acknowledges this staged checkpoint.
      checkpoint = args[0]
      return { ok: true }
    }
    if (channel === 'session:set-sync') {
      pendingSessions.set(String(args[1] ?? 'local'), args)
      return true
    }
    if (channel === 'session:read-terminal-scrollback-sync') {
      const ref = (args[0] as { ref?: string } | undefined)?.ref
      return ref ? (scrollback.get(ref) ?? null) : null
    }
    throw new Error(`Synchronous IPC is unavailable in Tauri: ${channel}`)
  },
  on: (channel: string, listener: Listener) => {
    const set = listeners.get(channel) ?? new Set<Listener>()
    set.add(listener)
    listeners.set(channel, set)
  },
  once: (channel: string, listener: Listener) => {
    const once: Listener = (...args) => {
      ipcRenderer.removeListener(channel, once)
      listener(...args)
    }
    ipcRenderer.on(channel, once)
  },
  removeListener: (channel: string, listener: Listener) => {
    const set = listeners.get(channel)
    set?.delete(listener)
    if (!set?.size) {
      listeners.delete(channel)
    }
  },
  removeAllListeners: (channel: string) => {
    listeners.delete(channel)
  }
}

export const contextBridge = {
  exposeInMainWorld: (key: string, value: unknown) => {
    Object.defineProperty(window, key, { value, configurable: true })
  }
}
let zoomLevel = 0
export const webFrame = {
  getZoomLevel: () => zoomLevel,
  setZoomLevel: (value: number) => {
    zoomLevel = value
    document.documentElement.style.zoom = String(1.2 ** value)
  }
}
export const webUtils = { getPathForFile: () => '' }
export const electronAPI = { ipcRenderer }
