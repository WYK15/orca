import React, { useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent } from '@/components/ui/context-menu'
import { TableCellMarkdown } from './TableCellMarkdown'
import { LiveMarkdownTableMenu } from './LiveMarkdownTableMenu'
import { LiveMarkdownTableToolbar } from './LiveMarkdownTableToolbar'
import { useTableCellEditor } from './use-table-cell-editor'
import type { TableCellAddress } from './table-edit-transactions'
import type { MarkdownTable } from './table-source'

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
  const content = (
    <div
      className="live-md-table"
      contentEditable={false}
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
          restoreFocus={editor.restoreFocus}
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
    <ContextMenu onOpenChange={editor.setMenuOpen}>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={editor.restoreFocus}
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
          onAction={(action) => editor.structure(action, contextCell ?? editor.active ?? undefined)}
        />
      </ContextMenuContent>
    </ContextMenu>
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
              onClick={() => !editing && editor.focus(row, column)}
              onKeyDown={(event) => {
                if (!editing && event.key === 'Enter') {
                  event.preventDefault()
                  editor.focus(row, column)
                } else if (!editing && event.shiftKey && event.key === 'F10') {
                  editor.focus(row, column)
                }
              }}
            >
              {editing ? (
                <textarea
                  ref={editor.input}
                  className="live-md-cell-input"
                  value={editor.draft}
                  aria-label={`第 ${row + 1} 行第 ${column + 1} 列`}
                  onChange={(event) => editor.change(event.target.value)}
                  onKeyDown={editor.onKeyDown}
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
