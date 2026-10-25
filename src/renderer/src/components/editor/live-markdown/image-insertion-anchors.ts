import { StateEffect, StateField } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

const addAnchor = StateEffect.define<{ id: string; position: number }>()
const removeAnchor = StateEffect.define<string>()
export const imageInsertionAnchors = StateField.define<ReadonlyMap<string, number>>({
  create: () => new Map(),
  update(value, transaction) {
    const mapped = new Map(
      [...value].map(([id, position]) => [id, transaction.changes.mapPos(position, 1)])
    )
    for (const effect of transaction.effects) {
      if (effect.is(addAnchor)) {
        mapped.set(effect.value.id, effect.value.position)
      }
      if (effect.is(removeAnchor)) {
        mapped.delete(effect.value)
      }
    }
    return mapped
  }
})

export function anchorImageInsertion(view: EditorView): {
  insert: (markdown: string) => void
  cancel: () => void
} {
  const id = crypto.randomUUID()
  view.dispatch({ effects: addAnchor.of({ id, position: view.state.selection.main.head }) })
  const cancel = (): void => {
    if (view.dom.isConnected) {
      view.dispatch({ effects: removeAnchor.of(id) })
    }
  }
  return {
    cancel,
    insert(markdown) {
      const position = view.state.field(imageInsertionAnchors).get(id)
      if (position === undefined || !view.dom.isConnected || view.state.readOnly) {
        cancel()
        return
      }
      view.dispatch({
        changes: { from: position, insert: markdown },
        effects: removeAnchor.of(id),
        userEvent: 'input'
      })
    }
  }
}
