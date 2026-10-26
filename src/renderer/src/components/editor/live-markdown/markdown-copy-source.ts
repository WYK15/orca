import type { Command } from '@codemirror/view'
import { toast } from 'sonner'
import { selectedTableCellText } from './table-cell-command-target'
import { readTableGrid } from './table-grid-selection'
import { tableGridClipboard } from './table-grid-clipboard'
import { parseMarkdownTable } from './table-source'
import { syntaxTree } from '@codemirror/language'

export const copyMarkdownSource: Command = (view) => {
  const selected = view.state.selection.main
  const grid = readTableGrid(view.state)
  const node = grid ? syntaxTree(view.state).resolveInner(grid.tableFrom, 1) : null
  let tableNode = node
  while (tableNode?.parent && tableNode.name !== 'Table') {
    tableNode = tableNode.parent
  }
  const table =
    tableNode?.name === 'Table'
      ? parseMarkdownTable(view.state.doc.toString(), tableNode.from, tableNode.to)
      : null
  const text =
    grid && table
      ? tableGridClipboard(table, grid).markdown
      : (selectedTableCellText(view) ?? view.state.sliceDoc(selected.from, selected.to))
  if (!text) {
    return false
  }
  const write = window.api?.ui?.writeClipboardText
  void (write ? write(text) : navigator.clipboard.writeText(text)).catch(() =>
    toast.error('复制 Markdown 失败')
  )
  return true
}
