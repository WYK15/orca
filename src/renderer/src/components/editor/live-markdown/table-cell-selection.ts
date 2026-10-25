import { StateEffect, StateField } from '@codemirror/state'

export const selectTableCell = StateEffect.define<{ from: number; to: number } | null>()
export const tableCellSelection = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, transaction) {
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
    return next
  }
})
