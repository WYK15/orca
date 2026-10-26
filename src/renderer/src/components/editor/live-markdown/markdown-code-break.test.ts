import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { insertQuotedCodeBreak } from './markdown-code-break'
import { markdownDocumentModel } from './markdown-document-model'
import { markdownEditorMode } from './editor-context'

function target(source: string, mode: 'live' | 'source' = 'live') {
  let state = EditorState.create({
    doc: source,
    selection: { anchor: source.indexOf('alpha') + 5 },
    extensions: [
      history(),
      markdown({ base: markdownLanguage }),
      markdownDocumentModel,
      markdownEditorMode.of(mode)
    ]
  })
  return {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = transaction.state
    }
  }
}

it.each([
  ['> ```text\n> alpha\n> ```', '> ```text\n> alpha\n> \n> ```'],
  ['> ```text\n>   alpha\n> ```', '> ```text\n>   alpha\n>   \n> ```'],
  [
    '> 1. before\n>    ```text\n>    alpha\n>    ```',
    '> 1. before\n>    ```text\n>    alpha\n>    \n>    ```'
  ]
])('retains code containers on Enter in %j', (source, expected) => {
  const editor = target(source)
  expect(insertQuotedCodeBreak(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe(expected)
  const cursor = editor.state.selection.main.head
  expect(
    editor.state.doc.lineAt(cursor).text.slice(0, cursor - editor.state.doc.lineAt(cursor).from)
  ).toMatch(/^>[\t ]+$/)
  expect(undo(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe(source)
})

it.each(['```text\nalpha\n```', '> alpha', 'alpha'])(
  'keeps ordinary language indentation and prose commands unchanged in %j',
  (source) => {
    expect(insertQuotedCodeBreak(target(source))).toBe(false)
  }
)

it('keeps source Enter literal', () => {
  expect(insertQuotedCodeBreak(target('> ```text\n> alpha\n> ```', 'source'))).toBe(false)
})
