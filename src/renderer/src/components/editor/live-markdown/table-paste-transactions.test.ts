import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { pasteTableGridTransaction } from './table-paste-transactions'
import { parseMarkdownTable } from './table-source'
import { tableCellSelection } from './table-cell-selection'
import { markdownSourceExtensions, markdownSourceField } from './source-document'

it('pastes a rectangular range, grows the table, and restores exact original bytes with one undo', () => {
  const original =
    'Before ->\r\n\r\n|  A   | B   |\r\n| ---- | --- |\r\n| one  | two |\r\n\r\nAfter &gt;'
  let state = EditorState.create({
    doc: original.replace(/\r\n/g, '\n'),
    extensions: [history(), tableCellSelection, markdownSourceExtensions(original)]
  })
  const table = parseMarkdownTable(
    state.doc.toString(),
    state.doc.toString().indexOf('|'),
    state.doc.toString().indexOf('\n\nAfter')
  )!
  const target = {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = transaction.state
    }
  }
  target.dispatch(
    state.update(
      pasteTableGridTransaction(state, table, { row: 1, column: 1 }, [
        ['a', 'b'],
        ['c|d', 'e\nf']
      ])
    )
  )
  const source = state.doc.toString()
  expect(source).toContain('|  A   | B   |  |')
  expect(source).toContain('one')
  expect(source).toContain('c\\|d')
  expect(source).toContain('e<br>f')
  expect(source).toContain('After &gt;')
  expect(undo(target)).toBe(true)
  expect(state.field(markdownSourceField).raw).toBe(original)
})

it('fills missing cells without overwriting the following document', () => {
  const original = '| A | B | C |\n| --- | --- | --- |\n| old |\n\nafter'
  let state = EditorState.create({ doc: original, extensions: [tableCellSelection] })
  const table = parseMarkdownTable(original, 0, original.indexOf('\n\nafter'))!
  state = state.update(
    pasteTableGridTransaction(state, table, { row: 1, column: 1 }, [['one', 'two']])
  ).state
  const parsed = parseMarkdownTable(
    state.doc.toString(),
    0,
    state.doc.toString().indexOf('\n\nafter')
  )!
  expect(parsed.rows[1].cells.map((cell) => cell.text)).toEqual(['old', 'one', 'two'])
  expect(state.doc.toString()).toContain('\n\nafter')
})
