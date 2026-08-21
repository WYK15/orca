import React, { useRef } from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  RICH_MARKDOWN_TABLE_LIMITS,
  type RichMarkdownTableDimensions
} from './rich-markdown-table-insertion'

type RichMarkdownTableSizeGridProps = {
  selection: RichMarkdownTableDimensions
  onSelectionChange: (dimensions: RichMarkdownTableDimensions) => void
  onSelect: (dimensions: RichMarkdownTableDimensions) => void
}

const bodyRows = Array.from(
  { length: RICH_MARKDOWN_TABLE_LIMITS.bodyRows.quickMax },
  (_, index) => index + 1
)
const columns = Array.from(
  { length: RICH_MARKDOWN_TABLE_LIMITS.columns.quickMax },
  (_, index) => index + 1
)

function cellKey(dimensions: RichMarkdownTableDimensions): string {
  return `${dimensions.bodyRows}:${dimensions.columns}`
}

export function RichMarkdownTableSizeGrid({
  selection,
  onSelectionChange,
  onSelect
}: RichMarkdownTableSizeGridProps): React.JSX.Element {
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())

  const moveSelection = (
    current: RichMarkdownTableDimensions,
    bodyRowDelta: number,
    columnDelta: number
  ): void => {
    const next = {
      bodyRows: Math.min(
        Math.max(current.bodyRows + bodyRowDelta, RICH_MARKDOWN_TABLE_LIMITS.bodyRows.min),
        RICH_MARKDOWN_TABLE_LIMITS.bodyRows.quickMax
      ),
      columns: Math.min(
        Math.max(current.columns + columnDelta, RICH_MARKDOWN_TABLE_LIMITS.columns.min),
        RICH_MARKDOWN_TABLE_LIMITS.columns.quickMax
      )
    }
    onSelectionChange(next)
    cellRefs.current.get(cellKey(next))?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="grid"
        aria-label={translate(
          'auto.components.editor.RichMarkdownTableSizeGrid.grid',
          'Table size'
        )}
        className="grid grid-cols-10 gap-1"
      >
        {bodyRows.flatMap((bodyRowCount) =>
          columns.map((columnCount) => {
            const dimensions = { bodyRows: bodyRowCount, columns: columnCount }
            const active = bodyRowCount === selection.bodyRows && columnCount === selection.columns
            const highlighted =
              bodyRowCount <= selection.bodyRows && columnCount <= selection.columns
            const label = translate(
              'auto.components.editor.RichMarkdownTableSizeGrid.cell',
              '{{bodyRows}} body rows by {{columns}} columns',
              dimensions
            )

            return (
              <button
                key={cellKey(dimensions)}
                ref={(node) => {
                  if (node) {
                    cellRefs.current.set(cellKey(dimensions), node)
                  } else {
                    cellRefs.current.delete(cellKey(dimensions))
                  }
                }}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-selected={highlighted}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'size-5 rounded-xs border border-border bg-background',
                  highlighted && 'border-primary bg-accent'
                )}
                onFocus={() => onSelectionChange(dimensions)}
                onMouseEnter={() => onSelectionChange(dimensions)}
                onClick={() => onSelect(dimensions)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(dimensions)
                    return
                  }

                  const movement =
                    event.key === 'ArrowUp'
                      ? [-1, 0]
                      : event.key === 'ArrowDown'
                        ? [1, 0]
                        : event.key === 'ArrowLeft'
                          ? [0, -1]
                          : event.key === 'ArrowRight'
                            ? [0, 1]
                            : null
                  if (!movement) {
                    return
                  }
                  event.preventDefault()
                  moveSelection(dimensions, movement[0], movement[1])
                }}
              />
            )
          })
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        {translate(
          'auto.components.editor.RichMarkdownTableSizeGrid.selection',
          '{{bodyRows}} body rows × {{columns}} columns, plus 1 header row',
          selection
        )}
      </p>
    </div>
  )
}
