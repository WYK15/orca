import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { readRuntimeFilePreview } from '@/runtime/runtime-file-client'

export type MarkdownImageReadContext = Omit<RuntimeFileOperationArgs, 'connectionId'> & {
  connectionId?: string | null
  sourceMarkdownPath?: string
}

export function readMarkdownImagePreview(
  absolutePath: string,
  connectionId?: string | null,
  runtimeContext?: MarkdownImageReadContext
) {
  try {
    if (!runtimeContext) {
      return window.api.fs.readFile({
        filePath: absolutePath,
        connectionId: connectionId ?? undefined
      })
    }
    if (
      runtimeContext.sourceMarkdownPath &&
      !runtimeContext.settings?.activeRuntimeEnvironmentId &&
      !(runtimeContext.connectionId ?? connectionId) &&
      !runtimeContext.expectedExternalSshTargetId &&
      (!runtimeContext.expectedExecutionHostId ||
        runtimeContext.expectedExecutionHostId === 'local')
    ) {
      return window.api.fs.readMarkdownImage({
        documentPath: runtimeContext.sourceMarkdownPath,
        imagePath: absolutePath
      })
    }
    return readRuntimeFilePreview(
      {
        ...runtimeContext,
        connectionId: runtimeContext.connectionId ?? connectionId ?? undefined
      },
      absolutePath
    )
  } catch (error) {
    return Promise.reject(error)
  }
}
