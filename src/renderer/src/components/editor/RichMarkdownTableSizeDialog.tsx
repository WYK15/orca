import React, { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import {
  RICH_MARKDOWN_TABLE_LIMITS,
  type RichMarkdownTableDimensions
} from './rich-markdown-table-insertion'

type RichMarkdownTableSizeDialogProps = {
  open: boolean
  initialDimensions: RichMarkdownTableDimensions
  onOpenChange: (open: boolean) => void
  onInsert: (dimensions: RichMarkdownTableDimensions) => boolean
}

function parseDimension(raw: string, max: number): number | null {
  if (!/^\d+$/.test(raw)) {
    return null
  }
  const value = Number(raw)
  return value >= 1 && value <= max ? value : null
}

function RichMarkdownTableSizeForm({
  initialDimensions,
  onCancel,
  onInsert
}: {
  initialDimensions: RichMarkdownTableDimensions
  onCancel: () => void
  onInsert: (dimensions: RichMarkdownTableDimensions) => boolean
}): React.JSX.Element {
  const [bodyRowsInput, setBodyRowsInput] = useState(String(initialDimensions.bodyRows))
  const [columnsInput, setColumnsInput] = useState(String(initialDimensions.columns))
  const [commandError, setCommandError] = useState(false)
  const bodyRowsErrorId = useId()
  const columnsErrorId = useId()
  const commandErrorId = useId()
  const bodyRows = parseDimension(bodyRowsInput, RICH_MARKDOWN_TABLE_LIMITS.bodyRows.max)
  const columns = parseDimension(columnsInput, RICH_MARKDOWN_TABLE_LIMITS.columns.max)
  const bodyRowsInvalid = bodyRows === null
  const columnsInvalid = columns === null

  return (
    <form
      className="grid gap-4"
      aria-describedby={commandError ? commandErrorId : undefined}
      onSubmit={(event) => {
        event.preventDefault()
        if (bodyRows === null || columns === null) {
          return
        }
        setCommandError(false)
        if (!onInsert({ bodyRows, columns })) {
          setCommandError(true)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-sm">
          {translate('auto.components.editor.RichMarkdownTableSizeDialog.title', 'Insert table')}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {translate(
            'auto.components.editor.RichMarkdownTableSizeDialog.description',
            'A header row is added automatically.'
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-xs font-medium">
          {translate('auto.components.editor.RichMarkdownTableSizeDialog.bodyRows', 'Body rows')}
          <Input
            autoFocus
            type="number"
            inputMode="numeric"
            min={RICH_MARKDOWN_TABLE_LIMITS.bodyRows.min}
            max={RICH_MARKDOWN_TABLE_LIMITS.bodyRows.max}
            step={1}
            value={bodyRowsInput}
            aria-invalid={bodyRowsInvalid}
            aria-describedby={bodyRowsInvalid ? bodyRowsErrorId : undefined}
            onChange={(event) => {
              setBodyRowsInput(event.target.value)
              setCommandError(false)
            }}
          />
          {bodyRowsInvalid ? (
            <span id={bodyRowsErrorId} className="text-xs text-destructive">
              {translate(
                'auto.components.editor.RichMarkdownTableSizeDialog.bodyRowsError',
                'Enter a whole number from 1 to 100'
              )}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          {translate('auto.components.editor.RichMarkdownTableSizeDialog.columns', 'Columns')}
          <Input
            type="number"
            inputMode="numeric"
            min={RICH_MARKDOWN_TABLE_LIMITS.columns.min}
            max={RICH_MARKDOWN_TABLE_LIMITS.columns.max}
            step={1}
            value={columnsInput}
            aria-invalid={columnsInvalid}
            aria-describedby={columnsInvalid ? columnsErrorId : undefined}
            onChange={(event) => {
              setColumnsInput(event.target.value)
              setCommandError(false)
            }}
          />
          {columnsInvalid ? (
            <span id={columnsErrorId} className="text-xs text-destructive">
              {translate(
                'auto.components.editor.RichMarkdownTableSizeDialog.columnsError',
                'Enter a whole number from 1 to 50'
              )}
            </span>
          ) : null}
        </label>
      </div>
      {commandError ? (
        <p id={commandErrorId} className="text-xs text-destructive" role="alert">
          {translate(
            'auto.components.editor.RichMarkdownTableSizeDialog.commandError',
            'Could not insert table'
          )}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {translate('auto.components.editor.RichMarkdownTableSizeDialog.cancel', 'Cancel')}
        </Button>
        <Button type="submit" disabled={bodyRowsInvalid || columnsInvalid}>
          {translate('auto.components.editor.RichMarkdownTableSizeDialog.insert', 'Insert')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function RichMarkdownTableSizeDialog({
  open,
  initialDimensions,
  onOpenChange,
  onInsert
}: RichMarkdownTableSizeDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-w-sm sm:max-w-sm">
          <RichMarkdownTableSizeForm
            initialDimensions={initialDimensions}
            onCancel={() => onOpenChange(false)}
            onInsert={(dimensions) => {
              const inserted = onInsert(dimensions)
              if (inserted) {
                onOpenChange(false)
              }
              return inserted
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
