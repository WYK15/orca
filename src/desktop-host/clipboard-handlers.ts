import { stat } from 'node:fs/promises'
import type { Store } from '../main/persistence'
import {
  isENOENT,
  PATH_ACCESS_DENIED_MESSAGE,
  resolveAuthorizedPath
} from '../main/ipc/filesystem-auth'
import { writeFileToClipboard, type ClipboardFileDeps } from '../main/window/clipboard-file-copy'
import {
  cleanupExpiredRemoteClipboardFiles,
  writeRemoteFileToClipboard
} from '../main/window/clipboard-remote-file-copy'
import {
  saveClipboardImageBufferAsTempFile,
  type SaveClipboardImageAsTempFileArgs
} from '../main/window/clipboard-image-temp-file'
import { saveClipboardImageBufferInRuntime } from '../main/window/clipboard-runtime-image-upload'
import {
  assertClipboardImageBase64LengthWithinLimit,
  assertClipboardImageByteLengthWithinLimit
} from '../shared/clipboard-image'
import {
  assertClipboardTextWithinLimitWithYield,
  assertClipboardTextWriteWithinLimitWithYield,
  type ReadClipboardTextOptions
} from '../shared/clipboard-text'
import { desktopPath, nativeCall } from './desktop-context'
import { ipcMain } from './ipc-port'

export function registerClipboardHandlers(store: Store): void {
  void cleanupExpiredRemoteClipboardFiles().catch(console.error)
  for (const [channel, operation] of [
    ['clipboard:readText', 'clipboard-read'],
    ['clipboard:readSelectionText', 'clipboard-read-selection']
  ]) {
    ipcMain.handle(channel, async (_event, options?: ReadClipboardTextOptions) => {
      const text = await nativeCall(operation)
      if (typeof text !== 'string') {
        throw new Error('Invalid native clipboard response')
      }
      return assertClipboardTextWithinLimitWithYield(text, options)
    })
  }
  for (const channel of [
    'clipboard:writeText',
    'clipboard:writeTerminalText',
    'clipboard:writeSelectionText'
  ]) {
    ipcMain.handle(channel, async (_event, text: string) => {
      await assertClipboardTextWriteWithinLimitWithYield(text)
      await nativeCall(
        channel === 'clipboard:writeSelectionText'
          ? 'clipboard-write-selection'
          : 'clipboard-write',
        text
      )
    })
  }
  ipcMain.handle('clipboard:writeImage', async (_event, dataUrl: unknown) => {
    const prefix = 'data:image/png;base64,'
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) {
      throw new Error('Clipboard image must be a PNG data URL')
    }
    const content = dataUrl.slice(prefix.length)
    assertClipboardImageBase64LengthWithinLimit(content.length)
    await nativeCall('clipboard-write-image', content)
  })
  ipcMain.handle(
    'clipboard:saveImageAsTempFile',
    async (_event, args?: SaveClipboardImageAsTempFileArgs) => {
      const content = await nativeCall('clipboard-read-image')
      if (content === null) {
        return null
      }
      if (typeof content !== 'string') {
        throw new Error('Invalid native clipboard image')
      }
      assertClipboardImageBase64LengthWithinLimit(content.length)
      const buffer = Buffer.from(content, 'base64')
      assertClipboardImageByteLengthWithinLimit(buffer.length)
      const environment = args?.runtimeEnvironmentId?.trim()
      return environment && !args?.connectionId
        ? saveClipboardImageBufferInRuntime(desktopPath('userData'), environment, buffer)
        : saveClipboardImageBufferAsTempFile(buffer, args)
    }
  )
  ipcMain.handle('clipboard:writeFile', async (_event, args: unknown) => {
    const request =
      typeof args === 'string'
        ? { filePath: args }
        : (args as { filePath?: unknown; connectionId?: unknown } | null)
    if (!request || typeof request.filePath !== 'string') {
      return { ok: false, reason: 'invalid-path' }
    }
    const deps = fileClipboardDependencies(store)
    return typeof request.connectionId === 'string' && request.connectionId.trim()
      ? writeRemoteFileToClipboard({
          remotePath: request.filePath,
          connectionId: request.connectionId,
          deps
        })
      : writeFileToClipboard(request.filePath, deps)
  })
}

function fileClipboardDependencies(store: Store): ClipboardFileDeps {
  return {
    platform: process.platform,
    writeFileReference: async (path) => {
      await nativeCall('clipboard-write-file', path)
    },
    writeBuffer: () => {
      throw new Error('Native file clipboard is required')
    },
    runCommand: async () => {
      throw new Error('Native file clipboard is required')
    },
    resolveFilePath: async (path) => {
      try {
        const authorized = await resolveAuthorizedPath(path, store)
        await stat(authorized)
        return { ok: true, path: authorized }
      } catch (error) {
        return {
          ok: false,
          reason:
            error instanceof Error && error.message === PATH_ACCESS_DENIED_MESSAGE
              ? 'access-denied'
              : isENOENT(error)
                ? 'not-found'
                : 'invalid-path'
        }
      }
    }
  }
}
