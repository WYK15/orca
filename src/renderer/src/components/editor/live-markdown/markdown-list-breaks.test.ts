import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { continueListAfterBreak, markdownListBreakPrefix } from './markdown-list-breaks'
import { markdownDocumentModel } from './markdown-document-model'
import { markdownListDeletionNumbering } from './markdown-list-numbering'
import { markdownEditorMode } from './editor-context'
import {
  createSourceDocument,
  markdownSourceExtensions,
  markdownSourceField
} from './source-document'

function target(raw: string, anchor?: number, mode: 'live' | 'source' = 'live', readOnly = false) {
  const source = createSourceDocument(raw)
  let state = EditorState.create({
    doc: source.text,
    selection: { anchor: anchor ?? source.text.length },
    extensions: [
      history(),
      markdown({ base: markdownLanguage, addKeymap: false }),
      markdownDocumentModel,
      markdownSourceExtensions(raw),
      markdownListDeletionNumbering,
      markdownEditorMode.of(mode),
      EditorState.readOnly.of(readOnly)
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
  ['1. alpha  \n   ', '1. alpha\n2. '],
  ['1. alpha  \n   detail', '1. alpha  \n   detail\n2. '],
  ['- alpha  \n  ', '- alpha\n- '],
  ['- alpha  \n  detail', '- alpha  \n  detail\n- '],
  ['- [x] alpha  \n  detail', '- [x] alpha  \n  detail\n- [ ] '],
  ['> 1. alpha  \n>    ', '> 1. alpha\n> 2. '],
  ['> 1. alpha  \n>    detail', '> 1. alpha  \n>    detail\n> 2. '],
  ['1. alpha\n\n   ', '1. alpha\n\n2. '],
  ['1. alpha\n\n   detail', '1. alpha\n\n   detail\n\n2. ']
])('starts the next item after a continuation in %j', (original, expected) => {
  const editor = target(original)
  expect(continueListAfterBreak(editor)).toBe(true)
  expect(editor.raw).toBe(expected)
  expect(editor.state.selection.main.head).toBe(expected.length)
  expect(undo(editor)).toBe(true)
  expect(editor.raw).toBe(original)
  expect(redo(editor)).toBe(true)
  expect(editor.raw).toBe(expected)
})

it('renumbers subsequent siblings while retaining mixed line endings and unrelated text', () => {
  const original =
    'Before ->\r\n\r\n9. alpha  \r\n   detail\r\n10. bravo\r\n11. charlie\r\n\r\nAfter &gt;\n'
  const anchor = original.replaceAll('\r\n', '\n').indexOf('detail') + 6
  const editor = target(original, anchor)
  expect(continueListAfterBreak(editor)).toBe(true)
  expect(editor.raw).toBe(
    original
      .replace('detail\r\n10. bravo', 'detail\r\n10. \r\n11. bravo')
      .replace('11. charlie', '12. charlie')
  )
  expect(undo(editor)).toBe(true)
  expect(editor.raw).toBe(original)
})

it('continues the nested list without changing outer sibling numbers', () => {
  const original = '1. parent\n   1. alpha  \n      detail\n   2. bravo\n2. next'
  const editor = target(original, original.indexOf('detail') + 6)
  expect(continueListAfterBreak(editor)).toBe(true)
  expect(editor.raw).toBe(original.replace('detail\n   2. bravo', 'detail\n   2. \n   3. bravo'))
})

it.each([
  ['1. alpha  \n   detail', '   '],
  ['- [x] alpha  \n  detail', '  '],
  ['> 1. alpha  \n>    detail', '>    '],
  ['1. parent\n   - alpha  \n     detail', '     '],
  ['1. alpha  \n     ', '   ']
])('retains list indentation across further soft breaks in %j', (source, expected) => {
  const editor = target(source)
  expect(markdownListBreakPrefix(editor.state, editor.state.selection.main.head)).toBe(expected)
})

it.each([
  'paragraph  \ncontinued',
  '1. alpha\n\noutside',
  '1. alpha\n\n',
  '1. alpha\n   ```\n   code',
  '1. alpha\n\n       code',
  '1. alpha'
])('leaves non-continuation and code input to its existing commands in %j', (source) => {
  const editor = target(source)
  expect(continueListAfterBreak(editor)).toBe(false)
  expect(editor.raw).toBe(source)
})

it('keeps source mode and reading mode unchanged', () => {
  const source = '1. alpha  \n   detail'
  expect(continueListAfterBreak(target(source, undefined, 'source'))).toBe(false)
  expect(continueListAfterBreak(target(source, undefined, 'live', true))).toBe(false)
})
