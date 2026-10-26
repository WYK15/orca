import type { MarkdownTable } from './table-source'
import { tableGridBounds, type TableGridSelection } from './table-grid-selection'
import { markdownClipboardContent } from './markdown-clipboard-content'

const tsvCell = (value: string): string =>
  /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
export function tableGridClipboard(
  table: MarkdownTable,
  selection: TableGridSelection
): { plain: string; html: string; markdown: string } {
  const bounds = tableGridBounds(selection)
  const rows = table.rows
    .slice(bounds.top, bounds.bottom + 1)
    .map((row) => row.cells.slice(bounds.left, bounds.right + 1))
  const rendered = rows.map((row) =>
    row.map((cell) =>
      markdownClipboardContent(cell.text.replace(/\\\|/g, '|').replace(/<br\s*\/?\s*>/gi, '\n'))
    )
  )
  const sourceRows = rows.map((row) => `| ${row.map((cell) => cell.text).join(' | ')} |`)
  sourceRows.splice(1, 0, `| ${rows[0].map(() => '---').join(' | ')} |`)
  return {
    plain: rendered.map((row) => row.map((cell) => tsvCell(cell.plain)).join('\t')).join('\n'),
    html: `<table><tbody>${rendered.map((row) => `<tr>${row.map((cell) => `<td>${cell.html}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
    markdown: sourceRows.join('\n')
  }
}
