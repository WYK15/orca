import type { EditorState, TransactionSpec } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import { parseMarkdownTable, type MarkdownTable } from './table-source'
import { reorderMarkdownTable } from './table-reorder-source'
import { selectCellTransaction } from './table-edit-transactions'

export function reorderTableTransaction(
  state: EditorState,
  table: MarkdownTable,
  axis: 'row' | 'column',
  from: number,
  to: number
): TransactionSpec {
  if (state.readOnly) {
    return {}
  }
  const changes = reorderMarkdownTable(state.doc.toString(), table, axis, from, to)
  if (!changes.length) {
    return {}
  }
  const updated = state.update({ changes })
  const next = parseMarkdownTable(
    updated.newDoc.toString(),
    table.from,
    updated.changes.mapPos(table.to, 1)
  )!
  const focused = updated.state.update(
    selectCellTransaction(updated.state, next, {
      row: axis === 'row' ? to : 0,
      column: axis === 'column' ? to : 0
    })
  )
  return {
    changes: updated.changes.compose(focused.changes),
    selection: focused.newSelection,
    effects: focused.effects,
    userEvent: 'input',
    annotations: isolateHistory.of('full'),
    scrollIntoView: true
  }
}
