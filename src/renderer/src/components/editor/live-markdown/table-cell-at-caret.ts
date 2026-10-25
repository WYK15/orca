import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { markdownEditorMode, revealedTableField } from './editor-context'
import { parseMarkdownTable } from './table-source'
import type { TableCellRange } from './table-cell-selection'

export function tableCellAtCaret(state: EditorState): TableCellRange | null {
  const caret = state.selection.main
  if (!caret.empty || state.readOnly || state.facet(markdownEditorMode) !== 'live') {
    return null
  }
  let node = syntaxTree(state).resolveInner(caret.head, 1)
  while (node.parent && node.name !== 'Table') {
    node = node.parent
  }
  if (
    node.name !== 'Table' ||
    caret.head <= node.from ||
    caret.head >= node.to ||
    state.field(revealedTableField, false) === node.from
  ) {
    return null
  }
  const table = parseMarkdownTable(state.doc.toString(), node.from, node.to)
  if (!table) {
    return null
  }
  const row =
    table.rows.find((line) => caret.head >= line.from && caret.head <= line.to) ?? table.rows[0]
  const column = row.cells
    .slice(0, table.delimiter.cells.length)
    .findIndex((cell) => caret.head <= cell.rawTo)
  const cell = row.cells[column < 0 ? table.delimiter.cells.length - 1 : column]
  return cell && !cell.missing ? { from: cell.from, to: cell.to } : null
}
