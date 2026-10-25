import { Facet, StateEffect, StateField } from '@codemirror/state'

export type MarkdownEditorMode = 'live' | 'source' | 'preview'
export const markdownEditorMode = Facet.define<MarkdownEditorMode, MarkdownEditorMode>({
  combine: (values) => values[0] ?? 'live'
})

export type MarkdownEditorContext = {
  version?: string
  loadImage: (path: string) => Promise<string | null>
  openLink: (href: string) => void
}
export const markdownEditorContext = Facet.define<MarkdownEditorContext, MarkdownEditorContext>({
  combine: (values) => values[0] ?? { loadImage: async () => null, openLink: () => {} }
})

export const revealTableSource = StateEffect.define<number | null>({
  map: (value, changes) => (value === null ? null : changes.mapPos(value))
})
export const revealedTableField = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    if (value !== null) {
      value = transaction.changes.mapPos(value)
    }
    for (const effect of transaction.effects) {
      if (effect.is(revealTableSource)) {
        value = effect.value
      }
    }
    return value
  }
})
