import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { insertMarkdownSoftBreak } from './markdown-soft-break'
import { markdownDocumentModel } from './markdown-document-model'
import { markdownDocumentSyntax } from './markdown-document-syntax'
import { markdownEditorMode } from './editor-context'
import {
  createSourceDocument,
  markdownSourceExtensions,
  markdownSourceField
} from './source-document'

function target(raw: string, anchor: number, head = anchor) {
  let state = EditorState.create({
    doc: createSourceDocument(raw).text,
    selection: { anchor, head },
    extensions: [
      history(),
      markdown({ base: markdownLanguage, extensions: markdownDocumentSyntax }),
      markdownDocumentModel,
      markdownSourceExtensions(raw),
      markdownEditorMode.of('live')
    ]
  })
  return {
    get state() {
      return state
    },
    get raw() {
      return state.field(markdownSourceField).raw
    },
    dispatch(transaction: Transaction) {
      state = transaction.state
    }
  }
}

it.each([
  ['> alpha', '> alpha  \n> '],
  ['> > alpha', '> > alpha  \n> > '],
  ['```text\n- alpha\n```', '```text\n- alpha\n\n```'],
  ['```text\n> alpha\n```', '```text\n> alpha\n\n```'],
  ['```text\n    alpha\n```', '```text\n    alpha\n    \n```'],
  ['    alpha', '    alpha\n    '],
  ['1. before\n   ```text\n   alpha\n   ```', '1. before\n   ```text\n   alpha\n   \n   ```'],
  ['> ```text\n> alpha\n> ```', '> ```text\n> alpha\n> \n> ```'],
  ['> ```text\n> > alpha\n> ```', '> ```text\n> > alpha\n> \n> ```'],
  [
    '> 1. before\n>    ```text\n>    alpha\n>    ```',
    '> 1. before\n>    ```text\n>    alpha\n>    \n>    ```'
  ],
  ['---\ntitle: alpha\n---', '---\ntitle: alpha\n\n---'],
  ['$$\n  alpha\n$$', '$$\n  alpha\n  \n$$']
])(
  'retains the owning container without interpreting code text as Markdown in %j',
  (source, expected) => {
    const editor = target(source, source.indexOf('alpha') + 5)
    expect(insertMarkdownSoftBreak(editor)).toBe(true)
    expect(editor.raw).toBe(expected)
    expect(undo(editor)).toBe(true)
    expect(editor.raw).toBe(source)
  }
)

it('replaces a selection with a soft break while preserving exact mixed line endings on undo', () => {
  const source = '> alpha detail\r\n\r\nBefore -> &gt;\n'
  const editor = target(source, 8, 14)
  insertMarkdownSoftBreak(editor)
  expect(editor.raw).toBe('> alpha   \r\n> \r\n\r\nBefore -> &gt;\n')
  undo(editor)
  expect(editor.raw).toBe(source)
})
