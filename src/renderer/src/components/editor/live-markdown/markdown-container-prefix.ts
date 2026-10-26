import { countColumn, type ChangeSpec, type EditorState } from '@codemirror/state'
import { readMarkdownDocumentTree } from './markdown-document-model'

export function markdownContainerPrefix(state: EditorState, position: number): string {
  const line = state.doc.lineAt(position)
  let end = line.from
  readMarkdownDocumentTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (node.name === 'QuoteMark' && /^[\t >]*$/.test(state.sliceDoc(line.from, node.from))) {
        end = node.to
      }
    }
  })
  while (end < line.to && /[\t ]/.test(state.sliceDoc(end, end + 1))) {
    end++
  }
  return state.sliceDoc(line.from, end)
}

export function shiftMarkdownContainerIndent(
  state: EditorState,
  position: number,
  delta: number
): ChangeSpec | null {
  const line = state.doc.lineAt(position)
  if (!delta || /^[\t >]*$/.test(line.text)) {
    return null
  }
  const prefix = markdownContainerPrefix(state, position)
  if (delta > 0) {
    return { from: line.from + prefix.length, insert: ' '.repeat(delta) }
  }
  const quote = prefix.lastIndexOf('>')
  const boundary = quote < 0 ? 0 : quote + 1 + (prefix[quote + 1] === ' ' ? 1 : 0)
  const keep = Math.max(
    0,
    countColumn(prefix, 4) - countColumn(prefix.slice(0, boundary), 4) + delta
  )
  return { from: line.from + boundary, to: line.from + prefix.length, insert: ' '.repeat(keep) }
}
