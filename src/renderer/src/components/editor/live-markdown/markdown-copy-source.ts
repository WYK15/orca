import type { Command } from '@codemirror/view'
import { toast } from 'sonner'
import { selectedTableCellText } from './table-cell-command-target'

export const copyMarkdownSource: Command = (view) => {
  const selected = view.state.selection.main
  const text = selectedTableCellText(view) ?? view.state.sliceDoc(selected.from, selected.to)
  if (!text) {
    return false
  }
  const write = window.api?.ui?.writeClipboardText
  void (write ? write(text) : navigator.clipboard.writeText(text)).catch(() =>
    toast.error('复制 Markdown 失败')
  )
  return true
}
