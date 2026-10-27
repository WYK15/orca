import { EditorState, MapMode, countColumn, type ChangeSpec } from '@codemirror/state'
import { markdownEditorMode } from './editor-context'
import { readMarkdownDocumentTree } from './markdown-document-model'
import { markdownContainerPrefix, shiftMarkdownContainerIndent } from './markdown-container-prefix'

export const markdownListMarkerWidth = EditorState.transactionFilter.of((transaction) => {
  const state = transaction.startState
  if (
    !transaction.docChanged ||
    state.readOnly ||
    state.facet(markdownEditorMode) !== 'live' ||
    !(transaction.isUserEvent('input') || transaction.isUserEvent('delete'))
  ) {
    return transaction
  }
  const deltas = new Map<number, number>()
  let from = state.doc.length
  let to = 0
  transaction.changes.iterChangedRanges((start, end) => {
    from = Math.min(from, start)
    to = Math.max(to, end)
  })
  readMarkdownDocumentTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.name !== 'ListItem' || node.node.parent?.name !== 'OrderedList') {
        return
      }
      const mark = node.node.getChild('ListMark')
      if (!mark || !transaction.changes.touchesRange(mark.from, mark.to)) {
        return
      }
      const oldDigits = state.sliceDoc(mark.from, mark.to - 1)
      const dot = transaction.changes.mapPos(mark.to - 1, 1, MapMode.TrackDel)
      if (
        dot === null ||
        transaction.newDoc.sliceString(dot, dot + 1) !== state.sliceDoc(mark.to - 1, mark.to)
      ) {
        return
      }
      const newLine = transaction.newDoc.lineAt(dot)
      const digits = transaction.newDoc.sliceString(newLine.from, dot).match(/\d+$/)?.[0]
      if (!digits || digits.length === oldDigits.length || digits.length > 9) {
        return
      }
      const oldLine = state.doc.lineAt(mark.from)
      const oldBefore = state.sliceDoc(oldLine.from, mark.from)
      const newBefore = transaction.newDoc.sliceString(newLine.from, dot - digits.length)
      const oldSpace = state.sliceDoc(mark.to, oldLine.to).match(/^[\t ]+/)?.[0] ?? ' '
      const newSpace =
        transaction.newDoc.sliceString(dot + 1, newLine.to).match(/^[\t ]+/)?.[0] ?? ' '
      const oldColumn = countColumn(state.sliceDoc(oldLine.from, mark.to) + oldSpace, 4)
      const oldWidth = oldColumn - countColumn(oldBefore, 4)
      const newWidth =
        countColumn(transaction.newDoc.sliceString(newLine.from, dot + 1) + newSpace, 4) -
        countColumn(newBefore, 4)
      const delta = newWidth - oldWidth
      if (!delta) {
        return
      }
      for (let number = oldLine.number + 1; number <= state.doc.lineAt(node.to).number; number++) {
        const line = state.doc.line(number)
        if (
          /^[\t >]*$/.test(line.text) ||
          countColumn(markdownContainerPrefix(state, line.from), 4) < oldColumn
        ) {
          continue
        }
        const from = transaction.changes.mapPos(line.from, 1, MapMode.TrackAfter)
        if (from !== null && transaction.newDoc.lineAt(from).from === from) {
          deltas.set(from, (deltas.get(from) ?? 0) + delta)
        }
      }
    }
  })
  const changes: ChangeSpec[] = []
  for (const [from, delta] of deltas) {
    const change = shiftMarkdownContainerIndent(transaction.state, from, delta)
    if (change) {
      changes.push(change)
    }
  }
  return changes.length ? [transaction, { changes, sequential: true }] : transaction
})
