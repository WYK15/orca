import type { TabContentType } from '../../../../shared/types'
import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison
} from '../../../../shared/cross-platform-path'
import type { OpenFile } from './editor'

function matchesTabContent(file: OpenFile, contentType: TabContentType): boolean {
  if (contentType === 'editor') {
    return file.mode === 'edit' || file.mode === 'markdown-preview'
  }
  return file.mode === contentType
}

export function resolveLiveEditorTabEntityId(
  openFiles: readonly OpenFile[],
  worktreeId: string,
  contentType: TabContentType,
  entityId: string
): string | null {
  const candidates = openFiles.filter(
    (file) => file.worktreeId === worktreeId && matchesTabContent(file, contentType)
  )
  const exact = candidates.find((file) => file.id === entityId)
  if (exact) {
    return exact.id
  }
  if (!isWindowsAbsolutePathLike(entityId)) {
    return null
  }

  const comparisonId = normalizeRuntimePathForComparison(entityId)
  return (
    candidates.find(
      (file) =>
        isWindowsAbsolutePathLike(file.filePath) &&
        normalizeRuntimePathForComparison(file.filePath) === comparisonId
    )?.id ?? null
  )
}
