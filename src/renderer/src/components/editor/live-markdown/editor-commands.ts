import { EditorSelection, type StateCommand } from '@codemirror/state'
import type { Command, KeyBinding } from '@codemirror/view'
import { insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown'
import { indentMore, indentLess, insertNewlineAndIndent } from '@codemirror/commands'
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
    const prefix = from > 0 && !view.state.sliceDoc(0, from).endsWith('\n\n') ? '\n\n' : ''
    const insert = `${prefix + content}\n\n`
    const table = content.startsWith('|') ? parseMarkdownTable(content, 0, content.length) : null
    const cell = table?.rows[1]?.cells[0]
    const cellRange = cell
      ? { from: from + prefix.length + cell.from, to: from + prefix.length + cell.to }
      : null
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: cellRange?.from ?? from + prefix.length + cursorOffset },
      effects: cellRange ? selectTableCell.of(cellRange) : [],
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
  if (end === view.state.doc.length) {
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
  const fence = line.text.match(/^(\s*)(`{3,}|~{3,})([\w+-]*)$/)
  if (!fence || state.selection.main.head !== line.to) {
    return false
  }
  const block = markdownCodeBlockAt(state)
  if (
    block &&
    (block.from < line.from ||
      (block.lastChild?.name === 'CodeMark' && block.lastChild.from > line.to))
  ) {
    return false
  }
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1).text : ''
  if (next.trim().startsWith(fence[2])) {
    return false
  }
  const insert = `\n${fence[1]}\n${fence[1]}${fence[2]}`
  dispatch(
    state.update({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + 1 + fence[1].length },
      userEvent: 'input'
    })
  )
  return true
}

const softBreak: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) {
    return false
  }
  const selection = state.selection.main
  const line = state.doc.lineAt(selection.from)
  const prefix = line.text.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/)
  const indent = prefix ? ' '.repeat(prefix[0].length) : ''
  const code = markdownCodeBlockAt(state)
  const breakText = code ? '\n' : '  \n'
  dispatch(
    state.update({
      changes: { from: selection.from, to: selection.to, insert: breakText + indent },
      selection: { anchor: selection.from + breakText.length + indent.length },
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
  { key: 'Enter', run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
  { key: 'Enter', run: paragraphBreak },
  { key: 'Enter', run: insertNewlineAndIndent },
  { key: 'Shift-Enter', run: softBreak },
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
