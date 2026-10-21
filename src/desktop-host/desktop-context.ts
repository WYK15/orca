import { resolve, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import type { StdioRpc } from './stdio-rpc'

let transport: StdioRpc | undefined

export function setDesktopTransport(value: StdioRpc): void {
  transport = value
}

export function nativeCall(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!transport) {
    throw new Error('Desktop transport is not initialized')
  }
  return transport.native(channel, args)
}

export function sendDesktopEvent(channel: string, ...args: unknown[]): void {
  transport?.emit(channel, ...args)
}

export function desktopPath(name: string): string {
  switch (name) {
    case 'userData': {
      const directory = process.env.ORCA_TAURI_USER_DATA
      if (!directory) {
        throw new Error('ORCA_TAURI_USER_DATA must be set by the desktop shell')
      }
      return resolve(directory)
    }
    case 'home':
      return homedir()
    case 'temp':
      return tmpdir()
    case 'exe':
      return process.execPath
    case 'appData':
      return resolve(desktopPath('userData'), '..')
    case 'logs':
      return join(desktopPath('userData'), 'logs')
    case 'downloads':
      return join(homedir(), 'Downloads')
    case 'documents':
      return join(homedir(), 'Documents')
    case 'desktop':
      return join(homedir(), 'Desktop')
    default:
      throw new Error(`Desktop path is not implemented: ${name}`)
  }
}

export function unsupportedDesktopFeature(feature: string): never {
  throw new Error(`This Tauri migration build does not support ${feature} yet`)
}
