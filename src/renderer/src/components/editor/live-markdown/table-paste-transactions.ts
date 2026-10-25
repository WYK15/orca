import type { ChangeSet, EditorState, TransactionSpec } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import {
  editTableCell,
  editTableStructure,
  parseMarkdownTable,
  type MarkdownTable
} from './table-source'
import { selectTableCell } from './table-cell-selection'
import type { TableCellAddress } from './table-edit-transactions'

export function pasteTableGridTransaction(
  state: EditorState,
  table: MarkdownTable,
  address: TableCellAddress,
  rows: string[][]
): TransactionSpec {
  if (state.readOnly || !rows.length || !rows.some((row) => row.length)) {
    return {}
  }
  let working = state
  let current = table
  let combined: ChangeSet = state.changes([])
  const apply = (changes: TransactionSpec['changes']): void => {
    const transaction = working.update({ changes })
    combined = combined.compose(transaction.changes)
    current = parseMarkdownTable(
      transaction.newDoc.toString(),
      transaction.changes.mapPos(current.from, -1),
      transaction.changes.mapPos(current.to, 1)
    )!
    working = transaction.state
  }
  const width = address.column + Math.max(...rows.map((row) => row.length))
  while (current.delimiter.cells.length < width) {
    apply(
      editTableStructure(
        working.doc.toString(),
        current,
        0,
        current.delimiter.cells.length - 1,
        'column-after'
      )
    )
  }
  while (current.rows.length < address.row + rows.length) {
    apply(
      editTableStructure(working.doc.toString(), current, current.rows.length - 1, 0, 'row-after')
    )
  }
  rows.forEach((values, offset) => {
    const row = address.row + offset
    const column = address.column + values.length - 1
    if (current.rows[row].cells[column]?.missing) {
      apply(editTableCell(current, row, column, '')!)
    }
  })
  apply(
    rows.flatMap((values, row) =>
      values.map(
        (value, column) =>
          editTableCell(current, address.row + row, address.column + column, value)!
      )
    )
  )
  const selected = current.rows[address.row].cells[address.column]
  return {
    changes: combined,
    selection: { anchor: selected.from },
    effects: selectTableCell.of({ from: selected.from, to: selected.to }),
    annotations: isolateHistory.of('full'),
    userEvent: 'input.paste',
    scrollIntoView: true
  }
}
