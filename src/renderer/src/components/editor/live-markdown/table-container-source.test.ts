import { expect, it } from 'vitest'
import { editTableStructure, parseMarkdownTable, type TableStructureAction } from './table-source'

function edit(source: string, row: number, action: TableStructureAction) {
  const from = source.indexOf('|')
  const to = source.indexOf('\nend')
  const table = parseMarkdownTable(source, from, to)!
  const changes = editTableStructure(source, table, row, 0, action)
  return changes
    .toSorted((a, b) => b.from - a.from)
    .reduce(
      (text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to),
      source
    )
}

it.each(['   ', '> ', '>    '])(
  'preserves container prefix %j when adding or promoting rows',
  (prefix) => {
    const source = `before\n${prefix}| A | B |\n${prefix}| --- | --- |\n${prefix}| x | y |\nend`
    expect(edit(source, 1, 'row-after')).toBe(
      source.replace(`${prefix}| x | y |`, `${prefix}| x | y |\n${prefix}|   |   |`)
    )
    expect(edit(source, 1, 'row-before')).toBe(
      source.replace(`${prefix}| x | y |`, `${prefix}|   |   |\n${prefix}| x | y |`)
    )
    expect(edit(source, 0, 'delete-row')).toBe(
      source.replace('| A | B |', '| x | y |').replace(`\n${prefix}| x | y |\nend`, '\nend')
    )
    expect(edit(source, 0, 'row-before')).toBe(
      source
        .replace('| A | B |', '|   |   |')
        .replace(`${prefix}| --- | --- |`, `${prefix}| --- | --- |\n${prefix}| A | B |`)
    )
    const moved = source
      .replace('| A | B |', '| x | y |')
      .replace('| x | y |\nend', '| A | B |\nend')
    expect(edit(source, 0, 'move-row-down')).toBe(moved)
    expect(edit(edit(source, 1, 'column-before'), 1, 'delete-column')).toBe(source)
  }
)

it('parses quote prefixes outside the table cells', () => {
  const source = '> | A | B |\n> | --- | --- |\n> | x | y |'
  const table = parseMarkdownTable(source, 2, source.length)!
  expect(table.prefix).toBe('> ')
  expect(table.rows[1].cells.map((c) => c.text)).toEqual(['x', 'y'])
})
