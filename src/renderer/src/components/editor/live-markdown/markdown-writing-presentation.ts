import { Facet, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { markdownEditorMode } from './editor-context'
import {
  defaultMarkdownWritingPreferences,
  type MarkdownWritingPreferences
} from './markdown-writing-preferences'

export const markdownWritingPreferences = Facet.define<
  MarkdownWritingPreferences,
  MarkdownWritingPreferences
>({ combine: (values) => values[0] ?? defaultMarkdownWritingPreferences })
function focusLines(state: EditorState) {
  if (
    !state.facet(markdownWritingPreferences).focus ||
    state.facet(markdownEditorMode) !== 'live'
  ) {
    return Decoration.none
  }
  const selected = state.selection.main
  let from = selected.from,
    to = selected.to
  if (selected.empty) {
    let node = syntaxTree(state).resolveInner(from, -1)
    while (
      node.parent &&
      node.parent.name !== 'Document' &&
      !['ListItem', 'Table', 'FencedCode', 'CodeBlock', 'DisplayMath', 'FrontMatter'].includes(
        node.name
      )
    ) {
      node = node.parent
    }
    if (node.name !== 'Document') {
      from = node.from
      to = node.to
    }
  }
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  return Decoration.set(
    Array.from({ length: last - first + 1 }, (_, index) =>
      Decoration.line({ class: 'live-md-focus-line' }).range(state.doc.line(first + index).from)
    )
  )
}
export const markdownFocusPresentation = StateField.define({
  create: focusLines,
  update(value, transaction) {
    return transaction.docChanged || transaction.selection || transaction.reconfigured
      ? focusLines(transaction.state)
      : value
  },
  provide: (field) => EditorView.decorations.from(field)
})

class MarkdownTypewriterPresentation {
  private frame = 0
  constructor(private readonly view: EditorView) {}
  update(update: ViewUpdate) {
    if (
      !(update.docChanged || update.selectionSet) ||
      update.view.composing ||
      !update.state.facet(markdownWritingPreferences).typewriter ||
      update.state.facet(markdownEditorMode) !== 'live' ||
      !this.view.dom.contains(document.activeElement)
    ) {
      return
    }
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      if (this.view.dom.isConnected) {
        this.view.dispatch({
          effects: EditorView.scrollIntoView(this.view.state.selection.main.head, { y: 'center' })
        })
      }
    })
  }
  destroy() {
    cancelAnimationFrame(this.frame)
  }
}
export const markdownTypewriterPresentation = ViewPlugin.fromClass(MarkdownTypewriterPresentation)
