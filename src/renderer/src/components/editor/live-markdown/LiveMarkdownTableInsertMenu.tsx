import { useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { RichMarkdownTableSizeGrid } from '../RichMarkdownTableSizeGrid'
import { RichMarkdownTableSizeDialog } from '../RichMarkdownTableSizeDialog'
import {
  validateRichMarkdownTableDimensions,
  type RichMarkdownTableDimensions
} from '../rich-markdown-table-insertion'
import { insertMarkdownBlock } from './editor-commands'

export function LiveMarkdownTableInsertMenu({ view }: { view: EditorView | null }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [size, setSize] = useState({ bodyRows: 2, columns: 2 })
  const insert = (dimensions: RichMarkdownTableDimensions): boolean => {
    if (!view || view.state.readOnly || !validateRichMarkdownTableDimensions(dimensions)) {
      return false
    }
    const header = `| ${Array.from({ length: dimensions.columns }, (_, index) => `列 ${index + 1}`).join(' | ')} |`
    const divider = `| ${Array.from({ length: dimensions.columns }, () => '---').join(' | ')} |`
    const row = `| ${Array.from({ length: dimensions.columns }, () => ' ').join(' | ')} |`
    const result = insertMarkdownBlock(
      [header, divider, ...Array.from({ length: dimensions.bodyRows }, () => row)].join('\n')
    )(view)
    if (result) {
      setOpen(false)
    }
    return result
  }
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="表格"
                disabled={!view}
                onMouseDown={(event) => event.preventDefault()}
              >
                <Table2 className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>插入表格</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          className="w-auto p-3"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <RichMarkdownTableSizeGrid
            selection={size}
            onSelectionChange={setSize}
            onSelect={insert}
          />
          <Button
            className="mt-2 w-full"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false)
              setCustom(true)
            }}
          >
            自定义尺寸
          </Button>
        </PopoverContent>
      </Popover>
      <RichMarkdownTableSizeDialog
        open={custom}
        initialDimensions={size}
        onOpenChange={setCustom}
        onInsert={insert}
      />
    </>
  )
}
