import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { history, undo } from '@codemirror/commands'
import { parseMarkdownTable } from './table-source'
import { reorderTableTransaction } from './table-reorder-transactions'
import {
  markdownSourceExtensions,
  markdownSourceField,
  createSourceDocument
} from './source-document'
import { tableCellSelection } from './table-cell-selection'
import { tableGridSelection } from './table-grid-selection'

function target(source: string) {
  return EditorState.create({
    doc: createSourceDocument(source).text,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      markdownSourceExtensions(source),
      tableGridSelection,
      tableCellSelection
    ]
  })
}
it('moves a body row without changing neighboring bytes and reverses in one undo', () => {
  const source =
    'Before ->\r\n\r\n| A | B |\r\n| :--- | ---: |\r\n| one | 1 |\r\n| two | 2 |\r\n| three | 3 |\n\nAfter &gt;'
  let state = target(source)
  const from = state.doc.toString().indexOf('| A')
  const to = state.doc.toString().indexOf('\n\nAfter')
  const table = parseMarkdownTable(state.doc.toString(), from, to)!
  state = state.update(reorderTableTransaction(state, table, 'row', 3, 1)).state
  expect(state.field(markdownSourceField).raw).toBe(
    source.replace(
      '| one | 1 |\r\n| two | 2 |\r\n| three | 3 |',
      '| three | 3 |\r\n| one | 1 |\r\n| two | 2 |'
    )
  )
  expect(
    undo({
      state,
      dispatch: (transaction) => {
        state = transaction.state
      }
    })
  ).toBe(true)
  expect(state.field(markdownSourceField).raw).toBe(source)
})
it('moves the column together with its header, alignment and every body cell', () => {
  const source = '| A  | B | C |\n| :--- | ---: | --- |\n| a  | b | c |'
  const state = target(source)
  const table = parseMarkdownTable(source, 0, source.length)!
  const changed = state.update(reorderTableTransaction(state, table, 'column', 0, 2)).state
  expect(changed.doc.toString()).toBe('| B | C | A  |\n| ---: | --- | :--- |\n| b | c | a  |')
})
it('materializes short rows during column moves while retaining extra unrendered cells', () => {
  const source = '| A | B | C |\n| --- | --- | --- |\n| short |\n| a | b | c | extra |'
  const state = target(source)
  const table = parseMarkdownTable(source, 0, source.length)!
  const changed = state.update(reorderTableTransaction(state, table, 'column', 0, 2)).state
  const next = parseMarkdownTable(changed.doc.toString(), 0, changed.doc.length)!
  expect(next.rows[1].cells.map((cell) => cell.text)).toEqual(['', '', 'short'])
  expect(next.rows[2].cells.map((cell) => cell.text)).toEqual(['b', 'c', 'a', 'extra'])
})
it('retains a valid header when promoting a short body row', () => {
  const source = '| A | B |\n| --- | --- |\n| short |'
  const state = target(source),
    table = parseMarkdownTable(source, 0, source.length)!
  const changed = state.update(reorderTableTransaction(state, table, 'row', 1, 0)).state
  expect(
    parseMarkdownTable(changed.doc.toString(), 0, changed.doc.length)?.rows[0].cells.map(
      (cell) => cell.text
    )
  ).toEqual(['short', ''])
})
it('preserves extra body content when promoting it into the header', () => {
  const source = '| A | B |\n| --- | --- |\n| a | b | extra |'
  const state = target(source)
  const table = parseMarkdownTable(source, 0, source.length)!
  const changed = state.update(reorderTableTransaction(state, table, 'row', 1, 0)).state
  const header = parseMarkdownTable(changed.doc.toString(), 0, changed.doc.length)!.rows[0]
  expect(header.cells).toHaveLength(2)
  expect(header.cells[1].text).toBe('b \\| extra')
})
