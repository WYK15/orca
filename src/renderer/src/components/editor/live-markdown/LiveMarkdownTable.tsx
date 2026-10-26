import React, { useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent } from '@/components/ui/context-menu'
import { TableCellMarkdown } from './TableCellMarkdown'
import { LiveMarkdownTableMenu } from './LiveMarkdownTableMenu'
import { LiveMarkdownTableToolbar } from './LiveMarkdownTableToolbar'
import { useTableCellEditor } from './use-table-cell-editor'
import type { TableCellAddress } from './table-edit-transactions'
import type { MarkdownTable } from './table-source'
import { useTableGridSelection } from './use-table-grid-selection'
import { tableGridContains, readTableGrid } from './table-grid-selection'
import { GripVertical, GripHorizontal } from 'lucide-react'
import { MarkdownTableGrip } from './MarkdownTableGrip'
import { TooltipProvider } from '@/components/ui/tooltip'
import { markdownWritingPreferences } from './markdown-writing-presentation'

export function LiveMarkdownTable({
  table,
  view,
  readOnly,
  revealSource
}: {
  table: MarkdownTable
  view: EditorView
  readOnly: boolean
  revealSource: () => void
}): React.JSX.Element {
  const editor = useTableCellEditor(table, view, readOnly)
  const [contextCell, setContextCell] = useState<TableCellAddress | null>(null)
  const grid = useTableGridSelection(table, view, readOnly, editor.active, editor.focus)
  const restoreFocus = (event: Event): void => {
    if (readTableGrid(view.state)?.tableFrom === table.from) {
      event.preventDefault()
      editor.setMenuOpen(false)
      requestAnimationFrame(() => grid.container.current?.focus({ preventScroll: true }))
    } else {
      editor.restoreFocus(event)
    }
  }
  const selectGroup = (kind: 'row' | 'column' | 'table'): void => {
    const cell = contextCell ?? editor.active ?? { row: 0, column: 0 }
    grid.select(
      { row: kind === 'row' ? cell.row : 0, column: kind === 'column' ? cell.column : 0 },
      {
        row: kind === 'row' ? cell.row : table.rows.length - 1,
        column: kind === 'column' ? cell.column : table.align.length - 1
      }
    )
  }
  const content = (
    <div
      className="live-md-table"
      data-grid-selection={grid.selection ? 'true' : undefined}
      ref={grid.container}
      tabIndex={grid.selection ? 0 : readOnly ? undefined : -1}
      contentEditable={false}
      onPointerDown={grid.onPointerDown}
      onPointerMove={grid.onPointerMove}
      onPointerUp={grid.onPointerUp}
      onPointerCancel={grid.onPointerUp}
      onCopy={grid.onCopy}
      onCut={grid.onCut}
      onPaste={grid.onPaste}
      onKeyDown={grid.onKeyDown}
      onDragOver={grid.dragOver}
      onDrop={grid.dropAtCell}
      onContextMenuCapture={(event) => {
        const element =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-table-cell]')
            : null
        const address = element?.dataset.tableCell?.split(':').map(Number)
        setContextCell(address ? { row: address[0], column: address[1] } : editor.active)
      }}
    >
      {!readOnly && (
        <LiveMarkdownTableToolbar
          onAction={editor.structure}
          revealSource={revealSource}
          onMenuChange={editor.setMenuOpen}
          restoreFocus={restoreFocus}
          onSelectGroup={selectGroup}
        />
      )}
      <table>
        <thead>{renderRow(0)}</thead>
        <tbody>{table.rows.slice(1).map((_, index) => renderRow(index + 1))}</tbody>
      </table>
    </div>
  )
  return readOnly ? (
    content
  ) : (
    <TooltipProvider>
      <ContextMenu onOpenChange={editor.setMenuOpen}>
        <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={restoreFocus}
          onPointerUpCapture={(event) => {
            // Menus clamped to the viewport can appear under the opening right-click.
            if (event.button !== 0) {
              event.preventDefault()
            }
          }}
        >
          <LiveMarkdownTableMenu
            kind="context"
            revealSource={revealSource}
            onAction={(action) =>
              editor.structure(action, contextCell ?? editor.active ?? undefined)
            }
            onSelectGroup={selectGroup}
          />
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
  )

  function renderRow(row: number): React.JSX.Element {
    return (
      <tr key={row}>
        {table.rows[row].cells.slice(0, table.delimiter.cells.length).map((cell, column) => {
          const Tag = row === 0 ? 'th' : 'td'
          const editing = editor.active?.row === row && editor.active.column === column
          return (
            <Tag
              key={column}
              style={{ textAlign: table.align[column] ?? undefined }}
              tabIndex={readOnly ? undefined : 0}
              data-table-cell={`${row}:${column}`}
              data-source-selected={
                tableGridContains(grid.selection, row, column) ||
                (!view.state.selection.main.empty &&
                  view.state.selection.main.from < cell.rawTo &&
                  view.state.selection.main.to > cell.rawFrom)
                  ? 'true'
                  : undefined
              }
              onClick={(event) => {
                if (!grid.click(event, row, column) && !editing) {
                  editor.focus(row, column)
                }
              }}
              onKeyDown={(event) => {
                if (!editing && event.key === 'Enter') {
                  event.preventDefault()
                  editor.focus(row, column)
                } else if (!editing && event.shiftKey && event.key === 'F10') {
                  editor.focus(row, column)
                }
              }}
            >
              {!readOnly && column === 0 && (
                <MarkdownTableGrip
                  dragging={grid.dragging}
                  onDragEnd={grid.dragEnd}
                  variant="ghost"
                  size="icon-xs"
                  className="live-md-row-grip"
                  aria-label={`移动第 ${row + 1} 行`}
                  draggable
                  onDragStart={(event) => grid.dragStart(event, 'row', row)}
                  onDragOver={grid.dragOver}
                  onDrop={(event) => grid.drop(event, 'row', row)}
                  onClick={(event) => {
                    event.stopPropagation()
                    grid.select({ row, column: 0 }, { row, column: table.align.length - 1 })
                  }}
                >
                  <GripVertical className="size-3.5" />
                </MarkdownTableGrip>
              )}
              {!readOnly && row === 0 && (
                <MarkdownTableGrip
                  dragging={grid.dragging}
                  onDragEnd={grid.dragEnd}
                  variant="ghost"
                  size="icon-xs"
                  className="live-md-column-grip"
                  aria-label={`移动第 ${column + 1} 列`}
                  draggable
                  onDragStart={(event) => grid.dragStart(event, 'column', column)}
                  onDragOver={grid.dragOver}
                  onDrop={(event) => grid.drop(event, 'column', column)}
                  onClick={(event) => {
                    event.stopPropagation()
                    grid.select({ row: 0, column }, { row: table.rows.length - 1, column })
                  }}
                >
                  <GripHorizontal className="size-3.5" />
                </MarkdownTableGrip>
              )}
              {editing ? (
                <textarea
                  ref={editor.input}
                  className="live-md-cell-input"
                  spellCheck={view.state.facet(markdownWritingPreferences).spellcheck}
                  value={editor.draft}
                  aria-label={`第 ${row + 1} 行第 ${column + 1} 列`}
                  onChange={(event) => editor.change(event.target.value)}
                  onKeyDown={editor.onKeyDown}
                  onPaste={editor.onPaste}
                  onCopy={editor.onCopy}
                  onCut={editor.onCut}
                />
              ) : (
                <TableCellMarkdown content={cell.text} view={view} />
              )}
            </Tag>
          )
        })}
      </tr>
    )
  }
}
