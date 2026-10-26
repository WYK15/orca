import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import {
  markdown,
  markdownLanguage,
  insertNewlineContinueMarkupCommand
} from '@codemirror/lang-markdown'
import { markdownEditorMode } from './editor-context'
import { markdownDocumentModel } from './markdown-document-model'
import { markdownListNumbers, markdownListDeletionNumbering } from './markdown-list-numbering'
import { removeListMarker } from './editor-commands'
import {
  createSourceDocument,
  markdownSourceExtensions,
  markdownSourceField
} from './source-document'

function target(raw: string, anchor?: number, mode: 'live' | 'source' = 'live') {
  const source = createSourceDocument(raw)
  let state = EditorState.create({
    doc: source.text,
    selection: { anchor: anchor ?? source.text.length },
    extensions: [
      history(),
      markdown({ base: markdownLanguage, addKeymap: false }),
      markdownDocumentModel,
      markdownSourceExtensions(raw),
      markdownEditorMode.of(mode),
      markdownListDeletionNumbering
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
    },
    edit(from: number, to: number, insert = '', userEvent = 'delete.selection') {
      this.dispatch(state.update({ changes: { from, to, insert }, userEvent }))
    }
  }
}

it('continues the preceding ordered item and renumbers its following siblings atomically', () => {
  const original = '1. alpha\n2. bravo\n3. charlie'
  const editor = target(original, 8)
  expect(insertNewlineContinueMarkupCommand({ nonTightLists: false })(editor)).toBe(true)
  expect(editor.raw).toBe('1. alpha\n2. \n3. bravo\n4. charlie')
  expect(removeListMarker(editor)).toBe(true)
  expect(editor.raw).toBe('1. alpha\n\n   \n2. bravo\n3. charlie')
  const cursor = editor.state.selection.main.head
  editor.edit(cursor, cursor, 'continued', 'input.type')
  expect(editor.raw).toBe('1. alpha\n\n   continued\n2. bravo\n3. charlie')
  expect([...markdownListNumbers(editor.state).values()]).toEqual(['1.', '2.', '3.'])
  expect(undo(editor)).toBe(true)
  expect(undo(editor)).toBe(true)
  expect(editor.raw).toBe('1. alpha\n2. \n3. bravo\n4. charlie')
  expect(undo(editor)).toBe(true)
  expect(editor.raw).toBe(original)
  expect(redo(editor)).toBe(true)
  expect(redo(editor)).toBe(true)
  expect(editor.raw).toBe('1. alpha\n\n   \n2. bravo\n3. charlie')
})

it.each([
  ['- first\n- ', '- first\n\n  '],
  ['- parent\n  - first\n  - ', '- parent\n  - first\n\n    '],
  ['> 1. first\n> 2. ', '> 1. first\n>\n>    '],
  ['- [x] first\n- [ ] ', '- [x] first\n\n  '],
  ['9. first\n10. ', '9. first\n\n   ']
])('keeps continuation indentation for %j', (original, expected) => {
  const editor = target(original)
  expect(removeListMarker(editor)).toBe(true)
  expect(editor.raw).toBe(expected)
  expect(editor.state.selection.main.head).toBe(expected.length)
})

it('removes the first empty marker without inventing a preceding item', () => {
  const editor = target('1. ')
  expect(removeListMarker(editor)).toBe(true)
  expect(editor.raw).toBe('')
})

it('renumbers after deleting a whole middle item and restores the exact source on undo', () => {
  const original = 'Before ->\r\n\r\n1. alpha\r\n2. bravo\r\n3. charlie\r\n\r\nAfter &gt;\n'
  const editor = target(original)
  const from = editor.state.doc.toString().indexOf('2. bravo')
  editor.edit(from, from + '2. bravo\n'.length)
  expect(editor.raw).toBe(original.replace('2. bravo\r\n', '').replace('3. charlie', '2. charlie'))
  expect(undo(editor)).toBe(true)
  expect(editor.raw).toBe(original)
  expect(redo(editor)).toBe(true)
  expect(editor.raw).toContain('2. charlie')
})

it.each([
  ['1. a\n2. b\n3. c', 0, 5, '1. b\n2. c'],
  ['7. a\n8. b\n9. c', 5, 10, '7. a\n8. c'],
  ['1. a\n2. b\n3. c\n4. d', 5, 15, '1. a\n2. d'],
  ['1. a\n2. b\n3. c', 4, 5, '1. a2. b\n2. c']
])('renumbers a structural deletion in %j', (original, from, to, expected) => {
  const editor = target(original)
  editor.edit(from, to)
  expect(editor.raw).toBe(expected)
})

it('renumbers only siblings in the affected nested list', () => {
  const original = '1. top\n   1. a\n   2. b\n   3. c\n2. next\n\nOther\n\n1. x\n2. y'
  const editor = target(original)
  const from = original.indexOf('   2. b')
  editor.edit(from, from + '   2. b\n'.length)
  expect(editor.raw).toBe(original.replace('   2. b\n', '').replace('   3. c', '   2. c'))
})

it.each(['1. a\n1. b\n1. c', '1. a\n2. b\n7. c'])(
  'preserves deliberate numbering in %j',
  (original) => {
    const editor = target(original)
    editor.edit(5, 10)
    expect(editor.raw).toBe(original.slice(0, 5) + original.slice(10))
    expect([...markdownListNumbers(editor.state).values()]).toEqual(['1.', '2.'])
  }
)

it('renders Markdown numbering without rewriting repeated markers, nested lists or custom starts', () => {
  const original = '5) a\n5) b\n   1. child\n   1. child\n5) c\n\nOther\n\n0. zero\n0. one'
  const editor = target(original)
  expect([...markdownListNumbers(editor.state).values()]).toEqual([
    '5)',
    '6)',
    '7)',
    '1.',
    '2.',
    '0.',
    '1.'
  ])
  expect(editor.raw).toBe(original)
})

it('does not normalize numbering while editing text or processing an external reload', () => {
  const original = '1. a\n2. b\n3. c'
  const editor = target(original)
  editor.edit(8, 9, 'changed', 'input.type')
  expect(editor.raw).toBe(original.replace('b', 'changed'))
  editor.edit(5, 16, '', 'external.reload')
  expect(editor.raw).toBe('1. a\n3. c')
})

it('keeps source-mode deletions literal', () => {
  const editor = target('1. a\n2. b\n3. c', 10, 'source')
  editor.edit(5, 10)
  expect(editor.raw).toBe('1. a\n3. c')
})

it.each([
  [5, 6, '8', '1. a\n8. b\n3. c'],
  [5, 7, '88)', '1. a\n88) b\n3. c'],
  [5, 10, '4. replacement\n', '1. a\n4. replacement\n3. c']
])(
  'preserves explicit marker or item replacements without renumbering unrelated siblings',
  (from, to, insert, expected) => {
    const editor = target('1. a\n2. b\n3. c')
    editor.edit(from, to, insert, 'input.paste')
    expect(editor.raw).toBe(expected)
  }
)

it('counts a replacement item when another selected item was deleted', () => {
  const editor = target('1. a\n2. b\n3. c\n4. d')
  editor.edit(5, 12, '8.', 'input.paste')
  expect(editor.raw).toBe('1. a\n8. c\n3. d')
})
