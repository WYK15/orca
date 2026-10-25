import { markdownFromClipboardHtml } from './clipboard-markdown'

export function tableClipboardGrid(data: DataTransfer): string[][] | null {
  const html = data.getData('text/html')
  if (html) {
    const document = new DOMParser().parseFromString(html, 'text/html')
    const table = document.querySelector('table')
    if (table) {
      const rows = Array.from(table.rows, (row) =>
        Array.from(row.cells, (cell) => markdownFromClipboardHtml(cell.innerHTML))
      )
      return rows.length ? rows : null
    }
  }
  const text = data.getData('text/plain')
  if (!text.includes('\t')) {
    return null
  }
  const rows: string[][] = [[]]
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (character === '"' && (!cell || quoted)) {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (!quoted && (character === '\t' || character === '\n' || character === '\r')) {
      rows.at(-1)!.push(cell)
      cell = ''
      if (character !== '\t') {
        if (character === '\r' && text[index + 1] === '\n') {
          index++
        }
        rows.push([])
      }
    } else {
      cell += character
    }
  }
  rows.at(-1)!.push(cell)
  if (rows.length > 1 && rows.at(-1)!.length === 1 && !rows.at(-1)![0]) {
    rows.pop()
  }
  return rows
}
