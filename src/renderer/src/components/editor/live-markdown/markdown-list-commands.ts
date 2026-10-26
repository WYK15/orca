import type { StateCommand } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import { readMarkdownDocumentTree } from './markdown-document-model'
import { markdownEditorMode } from './editor-context'

export const continuePreviousListItem: StateCommand = ({ state, dispatch }) => {
  const selection = state.selection.main
  if (state.readOnly || !selection.empty || state.facet(markdownEditorMode) !== 'live') {
    return false
  }
  const line = state.doc.lineAt(selection.head)
  if (selection.head !== line.to) {
    return false
  }
  let item = readMarkdownDocumentTree(state).resolveInner(selection.head, -1)
  while (item.parent && item.name !== 'ListItem') {
    item = item.parent
  }
  const mark = item.name === 'ListItem' ? item.getChild('ListMark') : null
  let previous = item.prevSibling
  while (previous && previous.name !== 'ListItem') {
    previous = previous.prevSibling
  }
  const previousMark = previous?.name === 'ListItem' ? previous.getChild('ListMark') : null
  if (
    !mark ||
    !previousMark ||
    mark.from < line.from ||
    !/^[\t ]*(?:\[[ xX]\][\t ]*)?$/.test(state.sliceDoc(mark.to, selection.head))
  ) {
    return false
  }
  const previousLine = state.doc.lineAt(previousMark.from)
  const before = state.sliceDoc(previousLine.from, previousMark.from)
  const spacing = state.sliceDoc(previousMark.to, previousLine.to).match(/^[\t ]*/)?.[0] ?? ' '
  const indent = before + ' '.repeat(previousMark.to - previousMark.from) + spacing
  const container = state.sliceDoc(line.from, mark.from).trimEnd()
  const insert = `${container}\n${indent}`
  dispatch(
    state.update({
      changes: { from: line.from, to: selection.head, insert },
      selection: { anchor: line.from + insert.length },
      annotations: isolateHistory.of('full'),
      userEvent: 'delete.backward',
      scrollIntoView: true
    })
  )
  return true
}
