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
