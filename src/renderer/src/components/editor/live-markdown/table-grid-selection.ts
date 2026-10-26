import { StateEffect, StateField, type EditorState } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'
import { markdownEditorMode } from './editor-context'
import type { TableCellAddress } from './table-edit-transactions'

export type TableGridSelection = {
  tableFrom: number
  anchor: TableCellAddress
  head: TableCellAddress
}
export const selectTableGrid = StateEffect.define<TableGridSelection | null>()
export const tableGridSelection: StateField<TableGridSelection | null> =
  StateField.define<TableGridSelection | null>({
    create: () => null,
    update(value, transaction) {
      if (transaction.state.facet(markdownEditorMode) === 'source') {
        return null
      }
      for (const effect of transaction.effects) {
        if (effect.is(selectTableGrid)) {
          return effect.value
        }
      }
      return transaction.docChanged || transaction.selection ? null : value
    },
    provide: () =>
      invertedEffects.of((transaction) =>
        transaction.docChanged
          ? [selectTableGrid.of(transaction.startState.field(tableGridSelection))]
          : []
      )
  })

export function tableGridBounds(selection: TableGridSelection) {
  return {
    top: Math.min(selection.anchor.row, selection.head.row),
    bottom: Math.max(selection.anchor.row, selection.head.row),
    left: Math.min(selection.anchor.column, selection.head.column),
    right: Math.max(selection.anchor.column, selection.head.column)
  }
}
export const readTableGrid = (state: EditorState): TableGridSelection | null =>
  state.field<TableGridSelection | null>(tableGridSelection, false) ?? null
export function tableGridContains(
  selection: TableGridSelection | null,
  row: number,
  column: number
): boolean {
  if (!selection) {
    return false
  }
  const bounds = tableGridBounds(selection)
  return (
    row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right
  )
}
