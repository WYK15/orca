import { EditorState, type StateCommand, type Transaction } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'

type TableCellInput = {
  element: HTMLTextAreaElement
  apply: (transaction: Transaction) => void
}
const inputs = new WeakMap<EditorView, TableCellInput>()

export function registerTableCellInput(view: EditorView, input: TableCellInput): () => void {
  inputs.set(view, input)
  return () => {
    if (inputs.get(view) === input) {
      inputs.delete(view)
    }
  }
}

export function runTableCellCommand(view: EditorView, command: StateCommand): boolean {
  const target = inputs.get(view)
  if (!target?.element.isConnected || view.state.readOnly) {
    return false
  }
  const element = target.element
  const state = EditorState.create({
    doc: element.value,
    selection: { anchor: element.selectionStart, head: element.selectionEnd },
    extensions: [markdown({ base: markdownLanguage })]
  })
  return command({ state, dispatch: target.apply })
}

export function focusMarkdownInput(view: EditorView): void {
  const input = inputs.get(view)?.element
  if (input?.isConnected) {
    input.focus({ preventScroll: true })
  } else {
    view.focus()
  }
}

export function hasTableCellInput(view: EditorView): boolean {
  return inputs.get(view)?.element.isConnected === true
}

export function selectedTableCellText(view: EditorView): string | null {
  const element = inputs.get(view)?.element
  return element?.isConnected
    ? element.value.slice(element.selectionStart, element.selectionEnd)
    : null
}
