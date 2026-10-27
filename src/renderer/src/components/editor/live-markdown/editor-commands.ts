import { EditorSelection, type StateCommand } from '@codemirror/state'
import type { Command, KeyBinding } from '@codemirror/view'
import { insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown'
import {
  indentMore,
  indentLess,
  insertNewlineAndIndent,
  isolateHistory
} from '@codemirror/commands'
import { revealTableSource, revealedTableField, markdownEditorMode } from './editor-context'
import { parseMarkdownTable } from './table-source'
import { selectTableCell } from './table-cell-selection'
import { clearMarkdownInlineFormat } from './markdown-clear-format'
import {
  toggleMarkdownInline,
  markdownCodeBlockAt,
  type MarkdownInlineFormat
} from './markdown-inline-format'
import { markdownDocumentBreak } from './markdown-document-commands'
import { runTableCellCommand, hasTableCellInput } from './table-cell-command-target'
import { removeMarkdownListItemMarker } from './markdown-list-commands'
import { insertQuotedCodeBreak } from './markdown-code-break'
import { continueListAfterBreak, markdownListBreakPrefix } from './markdown-list-breaks'
import { insertMarkdownSoftBreak } from './markdown-soft-break'
import { prepareMarkdownBlockInsertion } from './markdown-block-insertion'
import { markdownContainerPrefix } from './markdown-container-prefix'
import {
  completeMarkdownTable,
  setMarkdownHeading,
  toggleMarkdownBlock,
  indentMarkdownList
} from './markdown-block-commands'

export const removeListMarker: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) {
    return false
  }
  const selection = state.selection.main
  if (!selection.empty) {
    return false
  }
  if (removeMarkdownListItemMarker({ state, dispatch })) {
    return true
  }
  const line = state.doc.lineAt(selection.head)
  const prefix = line.text.match(/^(\s*)(?:[-+*]|\d+[.)]|#{1,6})\s+(?:\[[ xX]\]\s+)?/)
  if (!prefix || selection.head !== line.from + prefix[0].length) {
    return false
  }
  if (markdownCodeBlockAt(state)) {
    return false
  }
  dispatch(
    state.update({
      changes: { from: line.from + prefix[1].length, to: selection.head },
      selection: { anchor: line.from + prefix[1].length },
      userEvent: 'delete.backward'
    })
  )
  return true
}

export function wrapMarkdownSelection(before: string, after = before): Command {
  const command: StateCommand =
    ['**', '*', '~~', '`'].includes(before) && before === after
      ? toggleMarkdownInline(before as MarkdownInlineFormat)
      : ({ state, dispatch }) => {
          if (state.readOnly) {
            return false
          }
          dispatch(
            state.update(
              state.changeByRange((range) => ({
                changes: {
                  from: range.from,
                  to: range.to,
                  insert: before + state.sliceDoc(range.from, range.to) + after
                },
                range: range.empty
                  ? EditorSelection.cursor(range.from + before.length)
                  : EditorSelection.range(range.from + before.length, range.to + before.length)
              })),
              { userEvent: 'input' }
            )
          )
          return true
        }
  return (view) => (hasTableCellInput(view) ? runTableCellCommand(view, command) : command(view))
}

export function changeMarkdownHeading(level: number): Command {
  return (view) => hasTableCellInput(view) || setMarkdownHeading(level)(view)
}

export function changeMarkdownBlock(prefix: '- ' | '> ' | '1. ' | '- [ ] '): Command {
  return (view) => hasTableCellInput(view) || toggleMarkdownBlock(prefix)(view)
}

export const clearMarkdownFormat: Command = (view) =>
  hasTableCellInput(view)
    ? runTableCellCommand(view, clearMarkdownInlineFormat)
    : clearMarkdownInlineFormat(view)

export function insertMarkdownBlock(content: string, cursorOffset = content.length): Command {
  return (view) => {
    if (view.state.readOnly || hasTableCellInput(view)) {
      return false
    }
    const { from, to } = view.state.selection.main
    const insertion = prepareMarkdownBlockInsertion(view.state, from, to, content)
    const table = content.startsWith('|') ? parseMarkdownTable(content, 0, content.length) : null
    const cell = table?.rows[1]?.cells[0]
    const cellRange = cell
      ? { from: insertion.position(cell.from), to: insertion.position(cell.to) }
      : null
    view.dispatch({
      changes: insertion.change,
      selection: { anchor: cellRange?.from ?? insertion.position(cursorOffset) },
      effects: cellRange ? selectTableCell.of(cellRange) : [],
      annotations: isolateHistory.of('full'),
      userEvent: 'input',
      scrollIntoView: true
    })
    view.focus()
    return true
  }
}

export const exitCodeBlock: Command = (view) => {
  const node = markdownCodeBlockAt(view.state)
  if (!node || view.state.readOnly) {
    return false
  }
  const line = view.state.doc.lineAt(node.to)
  const end = line.to
  const prefix = markdownListBreakPrefix(view.state, end)
  if (prefix !== null) {
    const insert = `\n\n${prefix}`
    view.dispatch({
      changes: { from: end, insert },
      selection: { anchor: end + insert.length },
      annotations: isolateHistory.of('full'),
      userEvent: 'input',
      scrollIntoView: true
    })
  } else if (end === view.state.doc.length) {
    view.dispatch({
      changes: { from: end, insert: '\n\n' },
      selection: { anchor: end + 2 },
      userEvent: 'input',
      scrollIntoView: true
    })
  } else {
    view.dispatch({ selection: { anchor: end + 1 }, scrollIntoView: true })
  }
  return true
}

export const completeCodeFence: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly || !state.selection.main.empty) {
    return false
  }
  const line = state.doc.lineAt(state.selection.main.head)
  const block = markdownCodeBlockAt(state)
  if (
    block &&
    (block.name !== 'FencedCode' || state.doc.lineAt(block.from).number !== line.number)
  ) {
    return false
  }
  const opening = block?.getChild('CodeMark')
  const start = opening?.from ?? line.from + markdownContainerPrefix(state, line.from).length
  const fence = state.sliceDoc(start, line.to).match(/^(`{3,}|~{3,})([\w+-]*)$/)
  if (!fence || state.selection.main.head !== line.to) {
    return false
  }
  if (
    block &&
    (block.from < line.from ||
      (block.lastChild?.name === 'CodeMark' && block.lastChild.from > line.to))
  ) {
    return false
  }
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1).text : ''
  const indent = state.sliceDoc(line.from, start).replace(/[^\t >]/g, ' ')
  if (next.slice(indent.length).startsWith(fence[1])) {
    return false
  }
  const insert = `\n${indent}\n${indent}${fence[1]}`
  dispatch(
    state.update({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + 1 + indent.length },
      userEvent: 'input'
    })
  )
  return true
}

export const paragraphBreak: StateCommand = ({ state, dispatch }) => {
  if (
    state.readOnly ||
    markdownCodeBlockAt(state) ||
    state.facet(markdownEditorMode) === 'source'
  ) {
    return false
  }
  const selection = state.selection.main
  const line = state.doc.lineAt(selection.head)
  if (!line.text.trim()) {
    return false
  }
  const insert = '\n\n'
  dispatch(
    state.update({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + insert.length },
      userEvent: 'input'
    })
  )
  return true
}

export const liveMarkdownKeymap: KeyBinding[] = [
  { key: 'Backspace', run: removeListMarker },
  { key: 'Enter', run: markdownDocumentBreak },
  { key: 'Enter', run: completeCodeFence },
  { key: 'Enter', run: completeMarkdownTable },
  { key: 'Enter', run: continueListAfterBreak },
  { key: 'Enter', run: insertQuotedCodeBreak },
  { key: 'Enter', run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
  { key: 'Enter', run: paragraphBreak },
  { key: 'Enter', run: insertNewlineAndIndent },
  { key: 'Shift-Enter', run: insertMarkdownSoftBreak },
  { key: 'Mod-Enter', run: exitCodeBlock },
  {
    key: 'Escape',
    run: (view) => {
      if (view.state.field(revealedTableField) === null) {
        return false
      }
      view.dispatch({ effects: revealTableSource.of(null) })
      return true
    }
  },
  {
    key: 'Tab',
    run: (view) => indentMarkdownList(false)(view) || indentMore(view),
    shift: (view) => indentMarkdownList(true)(view) || indentLess(view)
  },
  { key: 'Mod-b', run: wrapMarkdownSelection('**') },
  { key: 'Mod-i', run: wrapMarkdownSelection('*') },
  { key: 'Mod-`', run: wrapMarkdownSelection('`') },
  { key: 'Mod-Shift-`', run: wrapMarkdownSelection('`') },
  ...[0, 1, 2, 3, 4, 5, 6].map((level) => ({
    key: `Mod-${level}`,
    run: changeMarkdownHeading(level)
  })),
  { key: 'Mod-k', run: wrapMarkdownSelection('[', '](https://)') },
  { key: 'Mod-\\', run: clearMarkdownFormat }
]
