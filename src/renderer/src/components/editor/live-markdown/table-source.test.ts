import { expect, it } from 'vitest'
import { parseMarkdownTable, editTableCell, editTableStructure } from './table-source'

function apply(text: string, edits: { from: number; to: number; insert: string }[]) {
  for (const edit of edits.toSorted((a, b) => b.from - a.from)) {
    text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
  }
  return text
}

it('changes only cell content while retaining all other table spacing and text', () => {
  const text =
    'Before ->\n\n|  Name   | Description     |\n| :------ | --------------: |\n| A\\|B    | http old        |\n\nAfter &gt;'
  const from = text.indexOf('|')
  const to = text.indexOf('\n\nAfter')
  const table = parseMarkdownTable(text, from, to)!
  expect(table.rows[1].cells[0].text).toBe('A\\|B')
  expect(apply(text, [editTableCell(table, 1, 1, 'http new')!])).toBe(
    text.replace('http old', 'http new')
  )
  expect(table.align).toEqual(['left', 'right'])
})

it('escapes inserted pipes and encodes a soft line break inside one cell', () => {
  const text = '| A | B |\n| --- | --- |\n| c | d |'
  const table = parseMarkdownTable(text, 0, text.length)!
  expect(apply(text, [editTableCell(table, 1, 1, 'one|two\nthree')!])).toContain(
    'one\\|two<br>three'
  )
})

it('keeps pipes escaped after an even number of backslashes while editing a cell', () => {
  const text = '| A | B |\n| --- | --- |\n| c | d |'
  const table = parseMarkdownTable(text, 0, text.length)!
  const result = apply(text, [editTableCell(table, 1, 1, String.raw`path\\|value`)!])
  const next = parseMarkdownTable(result, 0, result.length)!
  expect(next.rows[1].cells).toHaveLength(2)
  expect(next.rows[1].cells[1].text).toBe(String.raw`path\\\|value`)
})

it('adds and deletes rows while preserving the neighboring document', () => {
  const text = 'Before\n\n| A | B |\n| --- | --- |\n| c | d |\n\nAfter'
  const table = parseMarkdownTable(text, 8, text.indexOf('\n\nAfter'))!
  const result = apply(text, editTableStructure(text, table, 1, 0, 'row-after'))
  expect(result).toBe('Before\n\n| A | B |\n| --- | --- |\n| c | d |\n|   |   |\n\nAfter')
  expect(apply(text, editTableStructure(text, table, 1, 0, 'delete-row'))).toBe(
    'Before\n\n| A | B |\n| --- | --- |\n\nAfter'
  )
})

it('aligns only the selected delimiter and never rewrites body cells', () => {
  const text = '| A | B |\n| ------ | ---- |\n| <b>x</b> | -> |'
  const table = parseMarkdownTable(text, 0, text.length)!
  expect(apply(text, editTableStructure(text, table, 1, 1, 'align-center'))).toBe(
    '| A | B |\n| ------ | :---: |\n| <b>x</b> | -> |'
  )
})

it.each(['column-before', 'column-after'] as const)(
  'inserts with %s without reformatting neighboring cells',
  (action) => {
    const text = '|  A    | B      |\n| :---- | -----: |\n| <b>x</b>  | -> &gt;  |'
    const table = parseMarkdownTable(text, 0, text.length)!
    const result = apply(text, editTableStructure(text, table, 1, 0, action))
    const next = parseMarkdownTable(result, 0, result.length)!
    const inserted = action === 'column-before' ? 0 : 1
    expect(next.delimiter.cells).toHaveLength(3)
    expect(next.rows[1].cells[inserted].text).toBe('')
    expect(
      next.rows[1].cells
        .filter((_, index) => index !== inserted)
        .map((cell) => result.slice(cell.rawFrom, cell.rawTo))
    ).toEqual([' <b>x</b>  ', ' -> &gt;  '])
    expect(apply(result, editTableStructure(result, next, 1, inserted, 'delete-column'))).toBe(text)
  }
)

it.each(['column-before', 'column-after'] as const)(
  'inserts a blank edge column in a table without outer pipes using %s',
  (action) => {
    const text = 'A | B\n--- | ---\nx | y'
    const table = parseMarkdownTable(text, 0, text.length)!
    const column = action === 'column-before' ? 0 : 1
    const result = apply(text, editTableStructure(text, table, 1, column, action))
    const next = parseMarkdownTable(result, 0, result.length)!
    expect(next.rows[0].cells).toHaveLength(3)
    expect(next.rows[1].cells.map((cell) => cell.text)).toEqual(
      action === 'column-before' ? ['', 'x', 'y'] : ['x', 'y', '']
    )
  }
)

it('deletes a header by promoting the first body row and preserves alignment', () => {
  const text = '| A | B |\n| :---- | -----: |\n|  x  |  y  |\n| z | q |'
  const table = parseMarkdownTable(text, 0, text.length)!
  expect(apply(text, editTableStructure(text, table, 0, 0, 'delete-row'))).toBe(
    '|  x  |  y  |\n| :---- | -----: |\n| z | q |'
  )
})

it('inserts above the header by keeping the old header as the first body row', () => {
  const text = '| A | B |\n| :---- | -----: |\n| x | y |'
  const table = parseMarkdownTable(text, 0, text.length)!
  expect(apply(text, editTableStructure(text, table, 0, 1, 'row-before'))).toBe(
    '|   |   |\n| :---- | -----: |\n| A | B |\n| x | y |'
  )
})

it.each(['| x |', '| x | y | extra |'])(
  'preserves a ragged row when it becomes the new header: %s',
  (row) => {
    const text = `| A | B |\n| :---- | -----: |\n${row}`
    const table = parseMarkdownTable(text, 0, text.length)!
    const result = apply(text, editTableStructure(text, table, 0, 0, 'delete-row'))
    const next = parseMarkdownTable(result, 0, result.length)!
    expect(next.rows[0].cells).toHaveLength(2)
    expect(result).toContain('x')
    if (row.includes('extra')) {
      expect(result).toContain('y \\| extra')
    }
  }
)

it('keeps short and extra-width body rows intact during column operations', () => {
  const text = '| A | B |\n| --- | --- |\n| x |\n| x | y | extra |'
  const table = parseMarkdownTable(text, 0, text.length)!
  const result = apply(text, editTableStructure(text, table, 1, 1, 'delete-column'))
  expect(result).toBe('| A |\n| --- |\n| x |\n| x | extra |')
})
