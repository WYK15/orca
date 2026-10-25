import type { EditorState } from '@codemirror/state'
import { markdownEditorMode } from './editor-context'

export function markdownRangeIsActive(
  state: EditorState,
  from: number,
  to: number,
  includeEdges = true
): boolean {
  if (state.facet(markdownEditorMode) === 'preview') {
    return false
  }
  return state.selection.ranges.some((range) =>
    range.empty
      ? includeEdges
        ? range.head >= from && range.head <= to
        : range.head > from && range.head < to
      : range.from < to && range.to > from
  )
}
