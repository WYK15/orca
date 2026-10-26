import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { indentMarkdownList } from './markdown-list-indentation'
import { markdownDocumentModel } from './markdown-document-model'
import { markdownListDeletionNumbering } from './markdown-list-numbering'
import { markdownEditorMode } from './editor-context'
import {
  createSourceDocument,
  markdownSourceExtensions,
  markdownSourceField
} from './source-document'

function target(raw: string, mode: 'live' | 'source' = 'live') {
  const text = createSourceDocument(raw).text
  let state = EditorState.create({
    doc: text,
    selection: { anchor: text.indexOf('bravo') },
    extensions: [
      history(),
      markdown({ base: markdownLanguage }),
      markdownDocumentModel,
      markdownListDeletionNumbering,
      markdownEditorMode.of(mode),
      markdownSourceExtensions(raw)
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
  ['1. alpha\n2. bravo\n3. charlie', false, '1. alpha\n   1. bravo\n2. charlie'],
  [
    '1. alpha\n   1. bravo\n   2. child\n2. charlie',
    true,
    '1. alpha\n2. bravo\n   1. child\n3. charlie'
  ],
  [
    '1. alpha\n2. bravo\n   1. child\n3. charlie',
    false,
    '1. alpha\n   1. bravo\n      1. child\n2. charlie'
  ],
  [
    '1. alpha\n   5. child\n2. bravo\n3. charlie',
    false,
    '1. alpha\n   5. child\n   6. bravo\n2. charlie'
  ],
  ['5. alpha\n6. bravo\n7. charlie', false, '5. alpha\n   1. bravo\n6. charlie'],
  ['9. alpha\n10. bravo\n11. charlie', false, '9. alpha\n   1. bravo\n10. charlie'],
  ['> 1. alpha\n> 2. bravo\n> 3. charlie', false, '> 1. alpha\n>    1. bravo\n> 2. charlie'],
  [
    '> 1. alpha\n>    1. bravo\n>    2. child\n> 2. charlie',
    true,
    '> 1. alpha\n> 2. bravo\n>    1. child\n> 3. charlie'
  ],
  ['- alpha\n- bravo\n  - child\n- charlie', false, '- alpha\n  - bravo\n    - child\n- charlie'],
  ['- alpha\n  1. bravo\n  2. child\n- charlie', true, '- alpha\n- bravo\n  1. child\n- charlie'],
  [
    '1. alpha\n   - bravo\n   - child\n2. charlie',
    true,
    '1. alpha\n2. bravo\n   - child\n3. charlie'
  ]
])('moves the item and updates only the affected lists in %j', (source, outdent, expected) => {
  const editor = target(source)
  expect(indentMarkdownList(outdent)(editor)).toBe(true)
  expect(editor.raw).toBe(expected)
  expect(undo(editor)).toBe(true)
  expect(editor.raw).toBe(source)
  expect(redo(editor)).toBe(true)
  expect(editor.raw).toBe(expected)
})

it('retains exact mixed line endings and code literals when moving a subtree', () => {
  const source =
    'Before ->\r\n\r\n1. alpha\r\n2. bravo\r\n   ```text\r\n   99. literal\r\n   ```\r\n3. charlie\r\n\r\nAfter &gt;\n'
  const editor = target(source)
  indentMarkdownList(false)(editor)
  expect(editor.raw).toBe(
    source
      .replace('2. bravo', '   1. bravo')
      .replaceAll('\r\n   ', '\r\n      ')
      .replace('      1. bravo', '   1. bravo')
      .replace('3. charlie', '2. charlie')
  )
  undo(editor)
  expect(editor.raw).toBe(source)
})

it('keeps source-mode numbering literal during explicit indentation', () => {
  const editor = target('1. alpha\n2. bravo\n3. charlie', 'source')
  indentMarkdownList(false)(editor)
  expect(editor.raw).toBe('1. alpha\n   2. bravo\n3. charlie')
})
