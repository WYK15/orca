import React, { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { RichMarkdownTableSizeDialog } from './RichMarkdownTableSizeDialog'
import { RichMarkdownTableSizeGrid } from './RichMarkdownTableSizeGrid'
import {
  insertRichMarkdownTable,
  type RichMarkdownTableDimensions
} from './rich-markdown-table-insertion'

const INITIAL_TABLE_SIZE: RichMarkdownTableDimensions = {
  bodyRows: 3,
  columns: 3
}

export function RichMarkdownTableInsertMenu({
  editor
}: {
  editor: Editor | null
}): React.JSX.Element {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selection, setSelection] = useState<RichMarkdownTableDimensions>(INITIAL_TABLE_SIZE)
  const [quickInsertFailed, setQuickInsertFailed] = useState(false)
  const label = translate('auto.components.editor.RichMarkdownTableInsertMenu.table', 'Table')

  const handleInsert = useCallback(
    (dimensions: RichMarkdownTableDimensions): boolean =>
      editor ? insertRichMarkdownTable(editor, dimensions) : false,
    [editor]
  )

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open)
          if (open) {
            setQuickInsertFailed(false)
          }
        }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rich-markdown-toolbar-button"
                  aria-label={label}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <Table2 className="size-3.5" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <PopoverContent align="end" side="bottom" className="w-auto p-3">
          <RichMarkdownTableSizeGrid
            selection={selection}
            onSelectionChange={setSelection}
            onSelect={(dimensions) => {
              if (handleInsert(dimensions)) {
                setQuickInsertFailed(false)
                setPopoverOpen(false)
              } else {
                setQuickInsertFailed(true)
              }
            }}
          />
          {quickInsertFailed ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {translate(
                'auto.components.editor.RichMarkdownTableInsertMenu.commandError',
                'Could not insert table'
              )}
            </p>
          ) : null}
          <div className="mt-3 border-t border-border pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setPopoverOpen(false)
                setDialogOpen(true)
              }}
            >
              {translate(
                'auto.components.editor.RichMarkdownTableInsertMenu.customSize',
                'Custom size'
              )}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <RichMarkdownTableSizeDialog
        open={dialogOpen}
        initialDimensions={selection}
        onOpenChange={setDialogOpen}
        onInsert={handleInsert}
      />
    </>
  )
}
