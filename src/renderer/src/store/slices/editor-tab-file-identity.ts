import type { TabContentType } from '../../../../shared/tab-types'
import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '../../../../shared/cross-platform-path'
import type { OpenFile } from './editor'

export type LiveEditorTabFileIdentityIndex = Map<
  TabContentType,
  { exactIds: Set<string>; windowsPaths: Map<string, string> }
>

export function indexLiveEditorTabFile(
  index: LiveEditorTabFileIdentityIndex,
  file: OpenFile
): void {
  const contentType =
    file.mode === 'edit' || file.mode === 'markdown-preview' ? 'editor' : file.mode
  let identities = index.get(contentType)
  if (!identities) {
    identities = { exactIds: new Set(), windowsPaths: new Map() }
    index.set(contentType, identities)
  }
  identities.exactIds.add(file.id)
  if (isWindowsAbsolutePathLike(file.filePath)) {
    const path = normalizeRuntimePathForComparison(file.filePath)
    if (!identities.windowsPaths.has(path)) {
      identities.windowsPaths.set(path, file.id)
    }
  }
}

export function resolveIndexedLiveEditorTabEntityId(
  index: LiveEditorTabFileIdentityIndex | undefined,
  contentType: TabContentType,
  entityId: string
): string | null {
  const identities = index?.get(contentType)
  if (identities?.exactIds.has(entityId)) {
    return entityId
  }
  return isWindowsAbsolutePathLike(entityId)
    ? (identities?.windowsPaths.get(normalizeRuntimePathForComparison(entityId)) ?? null)
    : null
}

export function resolveLiveEditorTabEntityId(
  openFiles: readonly OpenFile[],
  worktreeId: string,
  contentType: TabContentType,
  entityId: string
): string | null {
  const index: LiveEditorTabFileIdentityIndex = new Map()
  for (const file of openFiles) {
    if (file.worktreeId === worktreeId) {
      indexLiveEditorTabFile(index, file)
    }
  }
  return resolveIndexedLiveEditorTabEntityId(index, contentType, entityId)
}
