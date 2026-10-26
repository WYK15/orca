import type { EditorState, TransactionSpec } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import {
  editTableCell,
  editTableStructure,
  parseMarkdownTable,
  type MarkdownTable,
  type TableStructureAction
} from './table-source'
import { selectTableCell, type TableCellRange } from './table-cell-selection'
import { selectTableGrid } from './table-grid-selection'

export type TableCellAddress = { row: number; column: number }

export function findTableCell(
  table: MarkdownTable,
  selected: TableCellRange | null
): TableCellAddress | null {
  if (!selected) {
    return null
  }
  for (let row = 0; row < table.rows.length; row++) {
    const column = table.rows[row].cells.findIndex(
      (cell) => !cell.missing && selected.from >= cell.rawFrom && selected.to <= cell.rawTo
    )
    if (column >= 0) {
      return { row, column }
    }
  }
  return null
}

export function selectCellTransaction(
  state: EditorState,
  table: MarkdownTable,
  address: TableCellAddress
): TransactionSpec {
  const cell = table.rows[address.row]?.cells[address.column]
  if (!cell || state.readOnly) {
    return {}
  }
  if (cell.missing) {
    const edit = editTableCell(table, address.row, address.column, '')!
    const changed = state.update({ changes: edit })
    const next = parseMarkdownTable(
      changed.newDoc.toString(),
      table.from,
      table.to + changed.changes.newLength - changed.changes.length
    )!
    const target = next.rows[address.row].cells[address.column]
    return {
      changes: edit,
      selection: { anchor: target.from },
      effects: selectTableCell.of({ from: target.from, to: target.to }),
      userEvent: 'input',
      annotations: isolateHistory.of('full')
    }
  }
  return {
    selection: { anchor: cell.from },
    effects: [selectTableGrid.of(null), selectTableCell.of({ from: cell.from, to: cell.to })]
  }
}

export function tableStructureTransaction(
  state: EditorState,
  table: MarkdownTable,
  address: TableCellAddress,
  action: TableStructureAction
): TransactionSpec {
  if (state.readOnly) {
    return {}
  }
  const changes = editTableStructure(
    state.doc.toString(),
    table,
    address.row,
    address.column,
    action
  )
  if (!changes.length) {
    return {}
  }
  const transaction = state.update({ changes })
  const from = transaction.changes.mapPos(table.from, -1)
  const to = transaction.changes.mapPos(table.to, 1)
  const next = from < to ? parseMarkdownTable(transaction.newDoc.toString(), from, to) : null
  const target = { ...address }
  if (action === 'row-after') {
    target.row++
  } else if (action === 'column-after') {
    target.column++
  } else if (action === 'move-row-up' || action === 'move-row-down') {
    target.row += action === 'move-row-up' ? -1 : 1
  } else if (action === 'move-column-left' || action === 'move-column-right') {
    target.column += action === 'move-column-left' ? -1 : 1
  }
  const focused = next
    ? transaction.state.update(
        selectCellTransaction(transaction.state, next, {
          row: Math.min(target.row, next.rows.length - 1),
          column: Math.min(target.column, next.delimiter.cells.length - 1)
        })
      )
    : null
  return {
    changes: focused ? transaction.changes.compose(focused.changes) : transaction.changes,
    selection: focused?.newSelection ?? { anchor: from },
    effects: focused?.effects ?? selectTableCell.of(null),
    userEvent: 'input',
    annotations: isolateHistory.of('full'),
    scrollIntoView: true
  }
}
