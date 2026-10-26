import { countColumn, type ChangeSpec, type StateCommand } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import { readMarkdownDocumentTree } from './markdown-document-model'
import { markdownEditorMode } from './editor-context'
import { shiftMarkdownContainerIndent } from './markdown-container-prefix'

export const removeMarkdownListItemMarker: StateCommand = ({ state, dispatch }) => {
  const selection = state.selection.main
  if (state.readOnly || !selection.empty || state.facet(markdownEditorMode) !== 'live') {
    return false
  }
  const line = state.doc.lineAt(selection.head)
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
    mark.from < line.from ||
    selection.head !==
      mark.to +
        (state.sliceDoc(mark.to, line.to).match(/^[\t ]+(?:\[[ xX]\][\t ]+)?/)?.[0].length ?? -1)
  ) {
    return false
  }
  if (!previousMark) {
    const before = state.sliceDoc(line.from, mark.from)
    const separator = before.trimEnd()
    const previousLine = line.number > 1 ? state.doc.line(line.number - 1) : null
    const insert =
      previousLine && !/^[\t >]*$/.test(previousLine.text) ? `${separator}\n${before}` : before
    const changes: ChangeSpec[] = [{ from: line.from, to: selection.head, insert }]
    const spacing = state.sliceDoc(mark.to, line.to).match(/^[\t ]+/)?.[0] ?? ' '
    const width =
      countColumn(state.sliceDoc(line.from, mark.to) + spacing, 4) - countColumn(before, 4)
    for (let number = line.number + 1; number <= state.doc.lineAt(item.to).number; number++) {
      const change = shiftMarkdownContainerIndent(state, state.doc.line(number).from, -width)
      if (change) {
        changes.push(change)
      }
    }
    let next = item.nextSibling
    while (next && next.name !== 'ListItem') {
      next = next.nextSibling
    }
    if (next) {
      const nextLine = state.doc.lineAt(next.from)
      if (selection.head < item.to && !/^[\t >]*$/.test(state.doc.line(nextLine.number - 1).text)) {
        changes.push({ from: nextLine.from, insert: `${separator}\n` })
      }
    }
    if (item.parent?.name === 'OrderedList') {
      let expected = Number.parseInt(state.sliceDoc(mark.from, mark.to), 10) + 1
      for (; next; next = next.nextSibling) {
        const nextMark = next.name === 'ListItem' ? next.getChild('ListMark') : null
        if (!nextMark) {
          continue
        }
        if (Number.parseInt(state.sliceDoc(nextMark.from, nextMark.to), 10) !== expected) {
          break
        }
        changes.push({ from: nextMark.from, to: nextMark.to - 1, insert: String(expected++ - 1) })
      }
    }
    dispatch(
      state.update({
        changes,
        selection: { anchor: line.from + insert.length },
        userEvent: 'delete.backward',
        annotations: isolateHistory.of('full')
      })
    )
    return true
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
