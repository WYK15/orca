import { StateEffect, StateField } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'
import { markdownEditorMode } from './editor-context'
import { tableCellAtCaret } from './table-cell-at-caret'

export type TableCellRange = { from: number; to: number }
export const selectTableCell = StateEffect.define<TableCellRange | null>({
  map: (cell, changes) =>
    cell && { from: changes.mapPos(cell.from, -1), to: changes.mapPos(cell.to, 1) }
})
export const tableCellSelection: StateField<TableCellRange | null> =
  StateField.define<TableCellRange | null>({
    create: tableCellAtCaret,
    update(value, transaction) {
      if (transaction.state.readOnly || transaction.state.facet(markdownEditorMode) !== 'live') {
        return null
      }
      const next = value
        ? {
            from: transaction.changes.mapPos(value.from, -1),
            to: transaction.changes.mapPos(value.to, 1)
          }
        : null
      for (const effect of transaction.effects) {
        if (effect.is(selectTableCell)) {
          return effect.value
        }
      }
      if (
        next &&
        transaction.selection &&
        (transaction.selection.main.from < next.from || transaction.selection.main.to > next.to)
      ) {
        return tableCellAtCaret(transaction.state)
      }
      return next ?? tableCellAtCaret(transaction.state)
    },
    provide: () =>
      invertedEffects.of((transaction) =>
        transaction.docChanged
          ? [selectTableCell.of(transaction.startState.field(tableCellSelection))]
          : []
      )
  })
