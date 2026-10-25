import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import {
  findTableCell,
  selectCellTransaction,
  tableStructureTransaction
} from './table-edit-transactions'
import { parseMarkdownTable, type TableStructureAction } from './table-source'
import { tableCellSelection } from './table-cell-selection'
import { markdownSourceExtensions, markdownSourceField } from './source-document'

const original =
  'Before ->\r\n\r\n|  A    | B      |\r\n| :---- | -----: |\r\n| x     | y      |\r\n| z     | q      |\r\n\r\nAfter &gt;'
function editor() {
  let state = EditorState.create({
    doc: original.replace(/\r\n/g, '\n'),
    extensions: [history(), tableCellSelection, markdownSourceExtensions(original)]
  })
  return {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = transaction.state
    },
    table() {
      return parseMarkdownTable(
        state.doc.toString(),
        state.doc.toString().indexOf('|'),
        state.doc.toString().indexOf('\n\nAfter')
      )!
    }
  }
}

it.each([
  ['row-before', 1, 1],
  ['row-after', 2, 1],
  ['column-before', 1, 1],
  ['column-after', 1, 2],
  ['delete-row', 1, 1],
  ['delete-column', 1, 0],
  ['align-center', 1, 1],
  ['clear-row', 1, 1],
  ['clear-column', 1, 1]
] as const)(
  'keeps %s focused in the intended rendered cell and reverses it in one undo',
  (action, row, column) => {
    const target = editor()
    target.dispatch(
      target.state.update(
        selectCellTransaction(target.state, target.table(), { row: 1, column: 1 })
      )
    )
    target.dispatch(
      target.state.update(
        tableStructureTransaction(target.state, target.table(), { row: 1, column: 1 }, action)
      )
    )
    expect(findTableCell(target.table(), target.state.field(tableCellSelection))).toEqual({
      row,
      column
    })
    const modified = target.state.field(markdownSourceField).raw
    expect(modified).not.toBe(original)
    expect(undo(target)).toBe(true)
    expect(target.state.field(markdownSourceField).raw).toBe(original)
    expect(findTableCell(target.table(), target.state.field(tableCellSelection))).toEqual({
      row: 1,
      column: 1
    })
    expect(redo(target)).toBe(true)
    expect(target.state.field(markdownSourceField).raw).toBe(modified)
    expect(findTableCell(target.table(), target.state.field(tableCellSelection))).toEqual({
      row,
      column
    })
  }
)

it('clears ownership when navigating outside the table', () => {
  const target = editor()
  target.dispatch(
    target.state.update(selectCellTransaction(target.state, target.table(), { row: 1, column: 1 }))
  )
  target.dispatch(target.state.update({ selection: { anchor: 0 } }))
  expect(target.state.field(tableCellSelection)).toBeNull()
})

it.each(['delete-table', 'delete-column'] as TableStructureAction[])(
  'safely handles a disappearing table with %s',
  (action) => {
    const source = '| A |\n| --- |\n| x |'
    let state = EditorState.create({ doc: source, extensions: [tableCellSelection] })
    const table = parseMarkdownTable(source, 0, source.length)!
    state = state.update(
      tableStructureTransaction(state, table, { row: 1, column: 0 }, action)
    ).state
    expect(state.doc.toString()).toBe('')
    expect(state.field(tableCellSelection)).toBeNull()
    expect(state.selection.main.head).toBe(0)
  }
)

it('materializes a missing trailing body cell only when it is edited', () => {
  const source = '| A | B | C |\n| - | - | - |\n| x |'
  let state = EditorState.create({ doc: source, extensions: [tableCellSelection] })
  const table = parseMarkdownTable(source, 0, source.length)!
  state = state.update(selectCellTransaction(state, table, { row: 1, column: 2 })).state
  expect(state.doc.toString()).toBe(source.replace('| x |', '| x |  |  |'))
  const next = parseMarkdownTable(state.doc.toString(), 0, state.doc.length)!
  expect(findTableCell(next, state.field(tableCellSelection))).toEqual({ row: 1, column: 2 })
})

it.each(['column-before', 'column-after', 'delete-column'] as const)(
  'keeps a short row editable after %s without leaving the rendered cell',
  (action) => {
    const source = '| A | B | C |\n| - | - | - |\n| x |'
    let state = EditorState.create({ doc: source, extensions: [tableCellSelection] })
    const table = parseMarkdownTable(source, 0, source.length)!
    state = state.update(
      tableStructureTransaction(state, table, { row: 1, column: 2 }, action)
    ).state
    const next = parseMarkdownTable(state.doc.toString(), 0, state.doc.length)!
    expect(findTableCell(next, state.field(tableCellSelection))).toEqual({
      row: 1,
      column: action === 'column-before' ? 2 : action === 'column-after' ? 3 : 1
    })
  }
)
