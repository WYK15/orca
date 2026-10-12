import type { AppState } from '@/store'

type RecoveryState = Pick<AppState, 'openFiles' | 'editorDrafts' | 'markdownViewMode'>

export const MARKDOWN_SAVE_RECOVERY_MESSAGE =
  'Markdown saving is paused. Review the source draft and accept its formatting changes, or restore the previous source.'

export function stageMarkdownSaveRecovery(
  state: RecoveryState,
  fileId: string,
  edited: string,
  source: string
): RecoveryState {
  if (!state.openFiles.some((file) => file.id === fileId && file.readOnly !== true)) {
    return state
  }
  return {
    openFiles: state.openFiles.map((file) =>
      file.id === fileId
        ? { ...file, isDirty: true, isPreview: false, markdownSaveRecovery: { source } }
        : file
    ),
    editorDrafts: { ...state.editorDrafts, [fileId]: edited },
    markdownViewMode: { ...state.markdownViewMode, [fileId]: 'source' }
  }
}

export function resolveMarkdownSaveRecovery(
  state: RecoveryState,
  fileId: string,
  choice: 'accept' | 'restore'
): Partial<RecoveryState> {
  const file = state.openFiles.find((entry) => entry.id === fileId)
  if (!file?.markdownSaveRecovery) {
    return {}
  }
  return {
    openFiles: state.openFiles.map((entry) =>
      entry.id === fileId ? { ...entry, markdownSaveRecovery: undefined } : entry
    ),
    ...(choice === 'restore'
      ? { editorDrafts: { ...state.editorDrafts, [fileId]: file.markdownSaveRecovery.source } }
      : {})
  }
}
