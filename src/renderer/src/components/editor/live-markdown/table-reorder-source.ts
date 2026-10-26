import type { MarkdownTable, MarkdownTableRow, MarkdownSourceEdit } from './table-source'

function moveIndex(order: number[], from: number, to: number): number[] {
  const result = [...order]
  result.splice(to, 0, result.splice(from, 1)[0])
  return result
}
function rowSource(text: string, row: MarkdownTableRow, width: number): string {
  const cells = row.cells.slice(0, width)
  const first = cells[0]
  const real = row.cells.filter((cell) => !cell.missing)
  const last = real.at(-1)!
  const values = cells.map((cell) => (cell.missing ? '  ' : text.slice(cell.rawFrom, cell.rawTo)))
  for (const extra of real.slice(width)) {
    values[width - 1] += `\\|${text.slice(extra.rawFrom, extra.rawTo)}`
  }
  return `${text.slice(row.from, first.rawFrom)}${values.join('|')}${text.slice(last.rawTo, row.to)}`
}

export function reorderMarkdownTable(
  text: string,
  table: MarkdownTable,
  axis: 'row' | 'column',
  from: number,
  to: number
): MarkdownSourceEdit[] {
  const count = axis === 'row' ? table.rows.length : table.delimiter.cells.length
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= count ||
    to >= count ||
    from === to
  ) {
    return []
  }
  const order = moveIndex(
    Array.from({ length: count }, (_, index) => index),
    from,
    to
  )
  if (axis === 'row') {
    return table.rows.flatMap((row, index) =>
      order[index] === index
        ? []
        : [
            {
              from: row.from,
              to: row.to,
              insert:
                index === 0
                  ? rowSource(text, table.rows[order[index]], table.delimiter.cells.length)
                  : text.slice(table.rows[order[index]].from, table.rows[order[index]].to)
            }
          ]
    )
  }
  return [table.rows[0], table.delimiter, ...table.rows.slice(1)].map((row) => {
    const real = row.cells.filter((cell) => !cell.missing)
    const suffix = text.slice(real.at(-1)!.rawTo, row.to)
    const cells = order.map((index) =>
      row.cells[index]?.missing || !row.cells[index]
        ? '  '
        : text.slice(row.cells[index].rawFrom, row.cells[index].rawTo)
    )
    cells.push(
      ...row.cells
        .slice(count)
        .filter((cell) => !cell.missing)
        .map((cell) => text.slice(cell.rawFrom, cell.rawTo))
    )
    return {
      from: row.from,
      to: row.to,
      insert: `${text.slice(row.from, row.cells[0].rawFrom)}${cells.join('|')}${suffix}`
    }
  })
}
