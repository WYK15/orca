export type MarkdownTableCell = { from: number; to: number; text: string }
export type MarkdownTableRow = { from: number; to: number; cells: MarkdownTableCell[] }
export type MarkdownTable = {
  from: number
  to: number
  rows: MarkdownTableRow[]
  delimiter: MarkdownTableRow
  align: ('left' | 'center' | 'right' | null)[]
}
export type MarkdownSourceEdit = { from: number; to: number; insert: string }

export function parseTableRow(text: string, from: number): MarkdownTableRow {
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
  if (delimiters.at(-1) !== text.trimEnd().length - 1) {
    delimiters.push(text.length)
  }
  const cells = delimiters.slice(0, -1).map((start, index) => {
    const end = delimiters[index + 1]
    const raw = text.slice(start + 1, end)
    const leading = raw.length - raw.trimStart().length
    const trailing = raw.length - raw.trimEnd().length
    const cellFrom = from + start + 1 + leading
    const cellTo = Math.max(cellFrom, from + end - trailing)
    return { from: cellFrom, to: cellTo, text: text.slice(cellFrom - from, cellTo - from) }
  })
  return { from, to: from + text.length, cells }
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
  if (!delimiter.cells.length || delimiter.cells.some((cell) => !/^:?-{3,}:?$/.test(cell.text))) {
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
  return { from, to, rows: [rows[0], ...rows.slice(2)], delimiter, align }
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
  const insert = value.replace(/(?<!\\)\|/g, '\\|').replace(/\r?\n/g, '<br>')
  return { from: cell.from, to: cell.to, insert }
}

export type TableStructureAction =
  | 'row-before'
  | 'row-after'
  | 'delete-row'
  | 'column-before'
  | 'column-after'
  | 'delete-column'
  | 'align-left'
  | 'align-center'
  | 'align-right'

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
    const at =
      row === 0 ? table.delimiter.to : action === 'row-before' ? selected.from : selected.to
    return [
      { from: at, to: at, insert: row > 0 && action === 'row-before' ? `${blank}\n` : `\n${blank}` }
    ]
  }
  if (action === 'delete-row') {
    if (row === 0) {
      return []
    }
    const hasNewline = text[selected.to] === '\n'
    const from = hasNewline ? selected.from : selected.from - 1
    const to = hasNewline ? selected.to + 1 : selected.to
    return [{ from, to, insert: '' }]
  }
  if (action === 'delete-column' && width <= 1) {
    return [{ from: table.from, to: table.to, insert: '' }]
  }
  return [table.rows[0], table.delimiter, ...table.rows.slice(1)].map((line) => {
    const cells = line.cells.map((cell) => cell.text)
    if (action === 'delete-column') {
      cells.splice(column, 1)
    } else {
      cells.splice(
        column + (action === 'column-after' ? 1 : 0),
        0,
        line === table.delimiter ? '---' : ''
      )
    }
    return { from: line.from, to: line.to, insert: `| ${cells.join(' | ')} |` }
  })
}
