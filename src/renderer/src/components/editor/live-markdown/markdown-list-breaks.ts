import {
  countColumn,
  type ChangeSpec,
  type EditorState,
  type StateCommand
} from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import type { SyntaxNode } from '@lezer/common'
import { markdownEditorMode } from './editor-context'
import { readMarkdownDocumentTree } from './markdown-document-model'

const blankContainer = (text: string): boolean => /^[\t >]*$/.test(text)

function enclosingListItem(state: EditorState, position: number): SyntaxNode | null {
  let node = readMarkdownDocumentTree(state).resolveInner(position, -1)
  while (node.parent) {
    if (
      [
        'FencedCode',
        'CodeBlock',
        'Table',
        'HTMLBlock',
        'FrontMatter',
        'DisplayMath',
        'FootnoteDefinition'
      ].includes(node.name)
    ) {
      return null
    }
    if (node.name === 'ListItem') {
      return node
    }
    node = node.parent
  }
  return null
}

function listBreakContext(state: EditorState, position: number) {
  const line = state.doc.lineAt(position)
  let item = enclosingListItem(state, position)
  if (!item && blankContainer(line.text)) {
    for (let number = line.number - 1; number > 0; number--) {
      const previous = state.doc.line(number)
      if (!blankContainer(previous.text)) {
        item = enclosingListItem(state, previous.to)
        break
      }
    }
  }
  const mark = item?.getChild('ListMark')
  if (!item || !mark) {
    return null
  }
  const first = state.doc.lineAt(mark.from)
  const before = state.sliceDoc(first.from, mark.from)
  const marker = state.sliceDoc(mark.from, mark.to)
  const after = state.sliceDoc(mark.to, first.to)
  const space = after.match(/^[\t ]+/)?.[0] ?? ' '
  const blank = before + ' '.repeat(marker.length) + space
  if (
    blankContainer(line.text) &&
    (line.text.trimEnd() !== before.trimEnd() || countColumn(line.text, 4) < countColumn(blank, 4))
  ) {
    return null
  }
  return { item, mark, first, before, marker, space, blank, after }
}

export function markdownListBreakPrefix(state: EditorState, position: number): string | null {
  return state.facet(markdownEditorMode) === 'live'
    ? (listBreakContext(state, position)?.blank ?? null)
    : null
}

export const continueListAfterBreak: StateCommand = ({ state, dispatch }) => {
  const selection = state.selection.main
  if (
    state.readOnly ||
    state.selection.ranges.length !== 1 ||
    state.facet(markdownEditorMode) !== 'live'
  ) {
    return false
  }
  const context = listBreakContext(state, selection.from)
  const line = state.doc.lineAt(selection.from)
  const endContext = selection.empty ? context : listBreakContext(state, selection.to)
  if (
    !context ||
    (line.from === context.first.from && selection.empty) ||
    selection.from < context.mark.to + context.space.length ||
    !endContext ||
    endContext.item.parent?.from !== context.item.parent?.from
  ) {
    return false
  }
  const { item, before, marker, space, after } = context
  const ordered = item.parent?.name === 'OrderedList'
  const number = Number.parseInt(marker, 10)
  const nextMarker = ordered ? `${number + 1}${marker.at(-1)}` : marker
  const task = after.match(/^[\t ]+\[[ xX]\]([\t ]+)/)
  const nextPrefix = before + nextMarker + space + (task ? `[ ]${task[1]}` : '')
  const siblings = item.parent?.getChildren('ListItem') ?? []
  const firstEnd = siblings[0] && state.doc.lineAt(siblings[0].to)
  const secondStart = siblings[1] && state.doc.lineAt(siblings[1].from)
  const loose =
    item.getChildren('Paragraph').length > 1 ||
    (firstEnd &&
      secondStart &&
      firstEnd.number + (blankContainer(firstEnd.text) ? 0 : 1) < secondStart.number)
  let from = selection.from
  let insert = `${loose ? `\n${before.trimEnd()}` : ''}\n${nextPrefix}`
  if (selection.empty && blankContainer(line.text) && selection.head === line.to) {
    const previous = state.doc.line(line.number - 1)
    from = previous.to
    while (from > previous.from && /[\t ]/.test(state.sliceDoc(from - 1, from))) {
      from--
    }
    insert = `\n${nextPrefix}`
  } else {
    while (from > line.from && /[\t ]/.test(state.sliceDoc(from - 1, from))) {
      from--
    }
  }
  const changes: ChangeSpec[] = [{ from, to: selection.to, insert }]
  if (ordered) {
    let expected = number + 1
    let removed = 0
    for (let next = item.nextSibling; next; next = next.nextSibling) {
      const mark = next.name === 'ListItem' ? next.getChild('ListMark') : null
      if (!mark) {
        continue
      }
      if (Number.parseInt(state.sliceDoc(mark.from, mark.to), 10) !== expected) {
        break
      }
      expected++
      if (mark.from < selection.to) {
        removed++
      } else {
        changes.push({ from: mark.from, to: mark.to - 1, insert: String(expected - removed) })
      }
    }
  }
  dispatch(
    state.update({
      changes,
      selection: { anchor: from + insert.length },
      annotations: isolateHistory.of('full'),
      userEvent: 'input',
      scrollIntoView: true
    })
  )
  return true
}
