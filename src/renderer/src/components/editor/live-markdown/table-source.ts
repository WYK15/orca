import { reorderMarkdownTable } from './table-reorder-source'

export type MarkdownTableCell = {
  from: number
  to: number
  rawFrom: number
  rawTo: number
  text: string
  missing?: boolean
}
export type MarkdownTableRow = {
  from: number
  to: number
  cells: MarkdownTableCell[]
  trailingPipe: boolean
  prefix: string
}
export type MarkdownTable = {
  from: number
  to: number
  rows: MarkdownTableRow[]
  delimiter: MarkdownTableRow
  align: ('left' | 'center' | 'right' | null)[]
  prefix: string
}
export type MarkdownSourceEdit = { from: number; to: number; insert: string }

export function parseTableRow(text: string, from: number): MarkdownTableRow {
  const prefix = text.match(/^[\t ]*(?:>[\t ]*)*/)?.[0] ?? ''
  const rowFrom = from
  const rowTo = from + text.length
  text = text.slice(prefix.length)
  from += prefix.length
  const delimiters: number[] = []
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '|') {
      continue
    }
    let escapes = 0
    for (let before = index - 1; before >= 0 && text[before] === '\\'; before--) {
      escapes++
    }
    if (escapes % 2 === 0) {
      delimiters.push(index)
    }
  }
  const first = text.search(/\S/)
  if (delimiters[0] !== first) {
    delimiters.unshift(-1)
  }
  const trailingPipe = delimiters.at(-1) === text.trimEnd().length - 1
  if (!trailingPipe) {
    delimiters.push(text.length)
  }
  const cells = delimiters.slice(0, -1).map((start, index) => {
    const end = delimiters[index + 1]
    const raw = text.slice(start + 1, end)
    const leading = raw.length - raw.trimStart().length
    const trailing = raw.length - raw.trimEnd().length
    const cellFrom = from + start + 1 + leading
    const cellTo = Math.max(cellFrom, from + end - trailing)
    return {
      from: cellFrom,
      to: cellTo,
      rawFrom: from + start + 1,
      rawTo: from + end,
      text: text.slice(cellFrom - from, cellTo - from)
    }
  })
  return { from: rowFrom, to: rowTo, cells, trailingPipe, prefix }
}

export function parseMarkdownTable(text: string, from: number, to: number): MarkdownTable | null {
  const lines = text.slice(from, to).split('\n')
  if (lines.length < 2) {
    return null
  }
  let offset = from
  const rows = lines.map((line) => {
    const row = parseTableRow(line, offset)
    offset += line.length + 1
    return row
  })
  const delimiter = rows[1]
  if (!delimiter.cells.length || delimiter.cells.some((cell) => !/^:?-+:?$/.test(cell.text))) {
    return null
  }
  const align = delimiter.cells.map((cell) =>
    cell.text.startsWith(':')
      ? cell.text.endsWith(':')
        ? 'center'
        : 'left'
      : cell.text.endsWith(':')
        ? 'right'
        : null
  ) as MarkdownTable['align']
  const contentRows = [rows[0], ...rows.slice(2)]
  for (const row of contentRows) {
    const at = row.cells.at(-1)?.rawTo ?? row.to
    while (row.cells.length < delimiter.cells.length) {
      row.cells.push({ from: at, to: at, rawFrom: at, rawTo: at, text: '', missing: true })
    }
  }
  const lineFrom = text.lastIndexOf('\n', from - 1) + 1
  const prefix = (text.slice(lineFrom, from) + rows[0].prefix).replace(/[^\t >]/g, ' ')
  return { from, to, rows: contentRows, delimiter, align, prefix }
}

export function editTableCell(
  table: MarkdownTable,
  row: number,
  column: number,
  value: string
): MarkdownSourceEdit | null {
  const cell = table.rows[row]?.cells[column]
  if (!cell) {
    return null
  }
  const insert = value
    .replace(/(\\*)\|/g, (_, escapes: string) => `${escapes}${escapes.length % 2 ? '' : '\\'}|`)
    .replace(/\r?\n/g, '<br>')
  if (cell.missing) {
    const line = table.rows[row]
    const count = line.cells.slice(0, column + 1).filter((item) => item.missing).length
    return {
      from: cell.from,
      to: cell.to,
      insert: `${'|  '.repeat(count - 1)}| ${insert} ${line.trailingPipe ? '' : '|'}`
    }
  }
  return { from: cell.from, to: cell.to, insert }
}

export type TableStructureAction =
  | 'row-before'
  | 'row-after'
  | 'delete-row'
  | 'column-before'
  | 'column-after'
  | 'delete-column'
  | 'clear-row'
  | 'clear-column'
  | 'delete-table'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'move-row-up'
  | 'move-row-down'
  | 'move-column-left'
  | 'move-column-right'

export function editTableStructure(
  text: string,
  table: MarkdownTable,
  row: number,
  column: number,
  action: TableStructureAction
): MarkdownSourceEdit[] {
  const width = table.delimiter.cells.length
  const selected = table.rows[row]
  if (!selected) {
    return []
  }
  if (action.startsWith('move-')) {
    const axis = action.includes('-row-') ? 'row' : 'column'
    const from = axis === 'row' ? row : column
    return reorderMarkdownTable(
      text,
      table,
      axis,
      from,
      from + (action.endsWith('up') || action.endsWith('left') ? -1 : 1)
    )
  }
  if (action === 'delete-table' || (action === 'delete-column' && width <= 1)) {
    return [{ from: table.from, to: table.to, insert: '' }]
  }
  if (action === 'clear-row' || action === 'clear-column') {
    const cells =
      action === 'clear-row'
        ? selected.cells
        : table.rows.flatMap((line) => (line.cells[column] ? [line.cells[column]] : []))
    return cells
      .filter((cell) => !cell.missing)
      .map((cell) => ({ from: cell.from, to: cell.to, insert: '' }))
  }
  if (action.startsWith('align-')) {
    const cell = table.delimiter.cells[column]
    if (!cell) {
      return []
    }
    const insert = action === 'align-left' ? ':---' : action === 'align-right' ? '---:' : ':---:'
    return [{ from: cell.from, to: cell.to, insert }]
  }
  if (action === 'row-before' || action === 'row-after') {
    const blank = `| ${Array.from({ length: width }, () => ' ').join(' | ')} |`
    const prefix = selected.prefix || table.prefix
    if (row === 0 && action === 'row-before') {
      return [
        { from: selected.from, to: selected.to, insert: selected.prefix + blank },
        {
          from: table.delimiter.to,
          to: table.delimiter.to,
          insert: `\n${prefix}${text.slice(selected.from + selected.prefix.length, selected.to)}`
        }
      ]
    }
    const at =
      row === 0 ? table.delimiter.to : action === 'row-before' ? selected.from : selected.to
    return [
      {
        from: at,
        to: at,
        insert: row > 0 && action === 'row-before' ? `${prefix}${blank}\n` : `\n${prefix}${blank}`
      }
    ]
  }
  if (action === 'delete-row') {
    if (row === 0) {
      const next = table.rows[1]
      if (!next) {
        return [{ from: table.from, to: table.to, insert: '' }]
      }
      let header = text.slice(next.from, next.to)
      if (next.cells[width - 1].missing) {
        const edit = editTableCell(table, 1, width - 1, '')!
        header = `${header.slice(0, edit.from - next.from)}${edit.insert}${header.slice(edit.to - next.from)}`
      } else {
        for (const extra of next.cells.slice(width).toReversed()) {
          const at = extra.rawFrom - next.from - 1
          header = `${header.slice(0, at)}\\${header.slice(at)}`
        }
      }
      return [
        {
          from: selected.from,
          to: selected.to,
          insert: selected.prefix + header.slice(next.prefix.length)
        },
        ...editTableStructure(text, table, 1, column, 'delete-row')
      ]
    }
    const hasNewline = text[selected.to] === '\n'
    const from = hasNewline ? selected.from : selected.from - 1
    const to = hasNewline ? selected.to + 1 : selected.to
    return [{ from, to, insert: '' }]
  }
  return [table.rows[0], table.delimiter, ...table.rows.slice(1)].flatMap((line) => {
    const cell = line.cells[column]
    if (!cell || cell.missing) {
      return []
    }
    if (action === 'delete-column') {
      const next = line.cells[column + 1]
      const previous = line.cells[column - 1]
      return [
        next && !next.missing
          ? { from: cell.rawFrom, to: next.rawFrom, insert: '' }
          : { from: previous ? previous.rawTo : cell.rawFrom, to: cell.rawTo, insert: '' }
      ]
    }
    const value = line === table.delimiter ? ' --- ' : '  '
    const before = action === 'column-before'
    const at = before ? cell.rawFrom : cell.rawTo
    const opening = before && column === 0 && text[cell.rawFrom - 1] !== '|' ? '|' : ''
    const closing = !before && column === width - 1 && text[cell.rawTo] !== '|' ? '|' : ''
    return [{ from: at, to: at, insert: before ? `${opening}${value}|` : `|${value}${closing}` }]
  })
}
