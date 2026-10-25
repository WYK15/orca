import React, { useLayoutEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { undo, redo } from '@codemirror/commands'
import { isolateHistory } from '@codemirror/commands'
import { MoreHorizontal, Plus, AlignLeft, AlignCenter, AlignRight, Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { TableCellMarkdown } from './TableCellMarkdown'
import {
  editTableCell,
  editTableStructure,
  parseTableRow,
  type MarkdownTable,
  type TableStructureAction
} from './table-source'
import { selectTableCell, tableCellSelection } from './table-cell-selection'

type CellAddress = { row: number; column: number }
type Props = {
  table: MarkdownTable
  view: EditorView
  readOnly: boolean
  revealSource: () => void
}

function cellText(table: MarkdownTable, cell: CellAddress): string {
  return (table.rows[cell.row]?.cells[cell.column]?.text ?? '')
    .replace(/\\\|/g, '|')
    .replace(/<br\s*\/?\s*>/gi, '\n')
}

export function LiveMarkdownTable({
  table,
  view,
  readOnly,
  revealSource
}: Props): React.JSX.Element {
  const [active, setActive] = useState<CellAddress | null>(() => {
    const selected = view.state.field(tableCellSelection)
    if (!selected) {
      return null
    }
    for (let row = 0; row < table.rows.length; row++) {
      const column = table.rows[row].cells.findIndex(
        (cell) => cell.from === selected.from && cell.to === selected.to
      )
      if (column >= 0) {
        return { row, column }
      }
    }
    return null
  })
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const current = useRef(table)
  current.current = table
  const owned = view.state.field(tableCellSelection)
  const sourceValue =
    active && owned
      ? view.state
          .sliceDoc(owned.from, owned.to)
          .replace(/\\\|/g, '|')
          .replace(/<br\s*\/?\s*>/gi, '\n')
      : active
        ? cellText(table, active)
        : ''

  useLayoutEffect(() => {
    if (active) {
      setDraft(sourceValue)
    }
  }, [sourceValue, active])
  useLayoutEffect(() => {
    if (!active || !input.current) {
      return
    }
    input.current.focus({ preventScroll: true })
    input.current.style.height = 'auto'
    input.current.style.height = `${input.current.scrollHeight}px`
  }, [active, draft])

  const focus = (row: number, column: number): void => {
    const cell = table.rows[row]?.cells[column]
    if (!cell || readOnly) {
      return
    }
    setDraft(cellText(table, { row, column }))
    setActive({ row, column })
    view.dispatch({
      selection: { anchor: cell.from },
      effects: selectTableCell.of({ from: cell.from, to: cell.to })
    })
  }
  const change = (value: string): void => {
    if (!active || readOnly) {
      return
    }
    setDraft(value)
    const cell = view.state.field(tableCellSelection)
    const change = editTableCell(current.current, active.row, active.column, value)
    const edit = cell && change ? { ...change, ...cell } : change
    if (edit && view.state.sliceDoc(edit.from, edit.to) !== edit.insert) {
      view.dispatch({ changes: edit, userEvent: 'input.type' })
    }
  }
  const structure = (action: TableStructureAction): void => {
    const cell = active ?? { row: table.rows.length - 1, column: 0 }
    view.dispatch({
      changes: editTableStructure(
        view.state.doc.toString(),
        current.current,
        cell.row,
        cell.column,
        action
      ),
      userEvent: 'input',
      annotations: isolateHistory.of('full')
    })
    if (action === 'delete-row' || action === 'delete-column') {
      setActive(null)
    }
  }
  const exit = (): void => {
    setActive(null)
    view.dispatch({ effects: selectTableCell.of(null) })
    const end = current.current.to
    const next = view.state.doc.lineAt(end)
    if (end === view.state.doc.length) {
      view.dispatch({
        changes: { from: end, insert: '\n\n' },
        selection: { anchor: end + 2 },
        userEvent: 'input'
      })
    } else {
      view.dispatch({
        selection: { anchor: Math.min(next.to + 1, view.state.doc.length) },
        scrollIntoView: true
      })
    }
    view.focus()
  }
  const move = (delta: number): void => {
    if (!active) {
      return
    }
    const width = table.delimiter.cells.length
    const target = active.row * width + active.column + delta
    if (target < 0) {
      exit()
      return
    }
    if (target >= table.rows.length * width) {
      structure('row-after')
      const nextLine = view.state.doc.lineAt(table.to + 1)
      const cell = parseTableRow(nextLine.text, nextLine.from).cells[target % width]
      if (cell) {
        view.dispatch({
          effects: selectTableCell.of({ from: cell.from, to: cell.to }),
          selection: { anchor: cell.from }
        })
      }
      setActive({ row: table.rows.length, column: target % width })
      setDraft('')
      return
    }
    focus(Math.floor(target / width), target % width)
  }

  return (
    <div className="live-md-table" contentEditable={false}>
      {!readOnly && (
        <div className="live-md-table-toolbar" onMouseDown={(event) => event.preventDefault()}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="添加表格行"
            onClick={() => structure('row-after')}
          >
            <Plus className="size-3.5" />
          </Button>
          {(['left', 'center', 'right'] as const).map((alignment) => {
            const Icon =
              alignment === 'left' ? AlignLeft : alignment === 'center' ? AlignCenter : AlignRight
            return (
              <Button
                key={alignment}
                variant="ghost"
                size="icon-xs"
                aria-label={
                  alignment === 'left' ? '左对齐' : alignment === 'center' ? '居中对齐' : '右对齐'
                }
                onClick={() => structure(`align-${alignment}`)}
              >
                <Icon className="size-3.5" />
              </Button>
            )
          })}
          <Button variant="ghost" size="icon-xs" aria-label="编辑表格源码" onClick={revealSource}>
            <Code className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="表格操作">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(
                [
                  ['row-before', '在上方插入行'],
                  ['row-after', '在下方插入行'],
                  ['column-before', '在左侧插入列'],
                  ['column-after', '在右侧插入列'],
                  ['delete-row', '删除当前行'],
                  ['delete-column', '删除当前列']
                ] as const
              ).map(([action, label]) => (
                <DropdownMenuItem
                  key={action}
                  disabled={action === 'delete-row' && active?.row === 0}
                  onSelect={() => structure(action)}
                >
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={revealSource}>编辑表格源码</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <table>
        <thead>{renderRow(0)}</thead>
        <tbody>{table.rows.slice(1).map((_, index) => renderRow(index + 1))}</tbody>
      </table>
    </div>
  )

  function renderRow(row: number): React.JSX.Element {
    return (
      <tr key={row}>
        {table.rows[row].cells.map((cell, column) => {
          const Tag = row === 0 ? 'th' : 'td'
          const editing = active?.row === row && active.column === column
          return (
            <Tag
              key={column}
              style={{ textAlign: table.align[column] ?? undefined }}
              tabIndex={readOnly ? undefined : 0}
              data-table-cell={`${row}:${column}`}
              onDoubleClick={() => focus(row, column)}
              onClick={() => !editing && focus(row, column)}
              onKeyDown={(event) => {
                if (!editing && event.key === 'Enter') {
                  event.preventDefault()
                  focus(row, column)
                }
              }}
            >
              {editing ? (
                <textarea
                  ref={input}
                  className="live-md-cell-input"
                  value={draft}
                  aria-label={`第 ${row + 1} 行第 ${column + 1} 列`}
                  onChange={(event) => change(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.nativeEvent.isComposing) {
                      return
                    }
                    const modifier = navigator.userAgent.includes('Mac')
                      ? event.metaKey
                      : event.ctrlKey
                    if (modifier && event.key.toLowerCase() === 'z') {
                      event.preventDefault()
                      ;(event.shiftKey ? redo : undo)(view)
                      return
                    }
                    if (event.key === 'Escape' || (modifier && event.key === 'Enter')) {
                      event.preventDefault()
                      exit()
                    } else if (event.key === 'Tab') {
                      event.preventDefault()
                      move(event.shiftKey ? -1 : 1)
                    } else if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      move(table.delimiter.cells.length)
                    }
                  }}
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
