import type { EditorState } from '@codemirror/state'
import { markdownEditorMode } from './editor-context'
import { markdownContainerPrefix } from './markdown-container-prefix'
import { markdownListBreakPrefix } from './markdown-list-breaks'

export function markdownBlockPrefix(state: EditorState, position: number): string {
  return state.facet(markdownEditorMode) === 'live'
    ? (markdownListBreakPrefix(state, position) ?? markdownContainerPrefix(state, position))
    : ''
}

export function prepareMarkdownBlockInsertion(
  state: EditorState,
  from: number,
  to: number,
  content: string
) {
  const indent = markdownBlockPrefix(state, from)
  const before = state.sliceDoc(state.doc.lineAt(from).from, from)
  const separator = `\n${indent.trimEnd()}\n`
  const leading = indent
    ? before === indent
      ? ''
      : separator + indent
    : from > 0 && !state.sliceDoc(0, from).endsWith('\n\n')
      ? '\n\n'
      : ''
  const body = content.replace(/\n/g, `\n${indent}`)
  const suffix = indent ? separator + indent : '\n\n'
  return {
    change: { from, to, insert: leading + body + suffix },
    position(offset: number): number {
      return (
        from +
        leading.length +
        offset +
        (content.slice(0, offset).match(/\n/g)?.length ?? 0) * indent.length
      )
    }
  }
}
