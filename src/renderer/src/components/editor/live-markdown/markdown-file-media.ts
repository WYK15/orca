import { useAppStore } from '@/store'
import {
  getEditorFileOperationContext,
  assertEditorFileOperationCurrent,
  captureEditorFileOperationProvenance
} from '@/lib/editor-file-operation-owner'
import { importExternalPathsToRuntime } from '@/runtime/runtime-file-client'
import { parseWorkspaceKey } from '../../../../../shared/workspace-scope'
import { loadLocalImageSrc } from '../useLocalImageSrc'
import { markdownAssetDirectory, markdownAssetReference } from './markdown-asset-directory'
import { readMarkdownWritingPreferences } from './markdown-writing-preferences'

export type MarkdownFileOwner = {
  filePath: string
  worktreeId: string
  runtimeEnvironmentId?: string | null
  externalSshTargetId?: string
}

export function markdownWorkspacePath(file: MarkdownFileOwner): string | null {
  const state = useAppStore.getState()
  const scope = parseWorkspaceKey(file.worktreeId)
  return scope?.type === 'folder'
    ? (state.folderWorkspaces.find((folder) => folder.id === scope.folderWorkspaceId)?.folderPath ??
        null)
    : (state.getKnownWorktreeById(file.worktreeId)?.path ?? null)
}

function contextForFile(file: MarkdownFileOwner) {
  const state = useAppStore.getState()
  const root = markdownWorkspacePath(file)
  const provenance = captureEditorFileOperationProvenance(
    state,
    file.worktreeId,
    file.runtimeEnvironmentId,
    file.runtimeEnvironmentId !== undefined
  )
  const context = getEditorFileOperationContext(
    state,
    { ...file, operationProvenance: provenance },
    root
  )
  return { context, provenance }
}

export async function loadMarkdownFileImage(
  file: MarkdownFileOwner,
  path: string
): Promise<string | null> {
  const { context } = contextForFile(file)
  return loadLocalImageSrc(path, file.filePath, context.connectionId, {
    ...context,
    expectedExternalSshTargetId: file.externalSshTargetId
  })
}

export async function importMarkdownFileImages(
  file: MarkdownFileOwner,
  paths: string[]
): Promise<string> {
  const { context, provenance } = contextForFile(file)
  const destination = markdownAssetDirectory(
    file.filePath,
    readMarkdownWritingPreferences().imageFolder
  )
  const { results } = await importExternalPathsToRuntime(context, paths, destination, {
    ensureDestinationDir: true,
    assertCurrent: () =>
      assertEditorFileOperationCurrent(useAppStore.getState(), file.worktreeId, provenance)
  })
  assertEditorFileOperationCurrent(useAppStore.getState(), file.worktreeId, provenance)
  const imported = results.filter((result) => result.status === 'imported')
  if (!imported.length) {
    throw new Error('图片导入失败')
  }
  return imported
    .map((result) => `![](${markdownAssetReference(file.filePath, result.destPath)})`)
    .join('\n')
}

export async function saveMarkdownClipboardImage(file: MarkdownFileOwner): Promise<string | null> {
  const { context, provenance } = contextForFile(file)
  const path = await window.api.ui.saveClipboardImageAsTempFile({
    connectionId: context.settings?.activeRuntimeEnvironmentId ? undefined : context.connectionId
  })
  assertEditorFileOperationCurrent(useAppStore.getState(), file.worktreeId, provenance)
  return path
}
