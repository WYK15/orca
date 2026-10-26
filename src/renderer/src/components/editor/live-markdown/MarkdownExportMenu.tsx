import { useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu'

export function MarkdownExportMenu({ view, title }: { view: EditorView | null; title: string }) {
  const [busy, setBusy] = useState(false)
  const run = async (format: 'html' | 'pdf'): Promise<void> => {
    if (!view || busy) {
      return
    }
    setBusy(true)
    try {
      const { markdownExportDocument } = await import('./markdown-export-document')
      const payload = await markdownExportDocument(view, title)
      if (format === 'html') {
        const result = await window.api.export.htmlToFile(payload)
        if (result.success) {
          toast.success('HTML 已导出')
        } else if (!result.cancelled) {
          toast.error(result.error ?? '导出失败')
        }
      } else {
        await window.api.export.printHtml(payload)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" disabled={!view || busy} aria-label="导出文档">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {busy ? '生成文档…' : '导出'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run('html')}>导出独立 HTML</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('pdf')}>打印 / 导出 PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
