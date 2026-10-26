import {
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
  type DragEvent
} from 'react'
import { runScopeHandlers, type EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import type { MarkdownTable } from './table-source'
import type { TableCellAddress } from './table-edit-transactions'
import { selectTableCell } from './table-cell-selection'
import { selectTableGrid, tableGridSelection, tableGridBounds } from './table-grid-selection'
import { tableGridClipboard } from './table-grid-clipboard'
import { tableClipboardGrid } from './table-clipboard-grid'
import { pasteTableGridTransaction } from './table-paste-transactions'
import { reorderTableTransaction } from './table-reorder-transactions'

const dragType = 'application/x-orcaw-markdown-table'
export function useTableGridSelection(
  table: MarkdownTable,
  view: EditorView,
  readOnly: boolean,
  active: TableCellAddress | null,
  focus: (row: number, column: number) => void
) {
  const [dragging, setDragging] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ start: TableCellAddress; x: number; y: number; moved: boolean } | null>(
    null
  )
  const suppressClick = useRef(false)
  const drag = useRef<{
    id: string
    axis: 'row' | 'column'
    index: number
    document: typeof view.state.doc
  } | null>(null)
  const selected = view.state.field(tableGridSelection, false)
  const selection = selected?.tableFrom === table.from ? selected : null
  const select = (anchor: TableCellAddress, head = anchor): void => {
    const cell = table.rows[anchor.row]?.cells[anchor.column]
    if (!cell) {
      return
    }
    view.dispatch({
      selection: { anchor: cell.from },
      effects: [
        selectTableGrid.of({ tableFrom: table.from, anchor, head }),
        selectTableCell.of(null)
      ]
    })
    container.current?.focus({ preventScroll: true })
  }
  const cellAt = (element: Element | null): TableCellAddress | null => {
    const cell = element?.closest<HTMLElement>('[data-table-cell]')
    if (!cell || !container.current?.contains(cell)) {
      return null
    }
    const [row, column] = cell.dataset.tableCell!.split(':').map(Number)
    return { row, column }
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    if (event.button !== 0 || target?.closest('textarea,button')) {
      return
    }
    const cell = cellAt(target)
    if (cell) {
      pointer.current = { start: cell, x: event.clientX, y: event.clientY, moved: false }
      event.preventDefault()
    }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const start = pointer.current
    if (!start || !(event.buttons & 1)) {
      return
    }
    const cell = cellAt(document.elementFromPoint(event.clientX, event.clientY))
    if (
      !cell ||
      (!start.moved && Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) < 5)
    ) {
      return
    }
    start.moved = true
    select(start.start, cell)
  }
  const onPointerUp = (): void => {
    suppressClick.current = pointer.current?.moved ?? false
    pointer.current = null
  }
  const click = (event: { shiftKey: boolean }, row: number, column: number): boolean => {
    if (suppressClick.current) {
      suppressClick.current = false
      return true
    }
    if (event.shiftKey) {
      select(selection?.anchor ?? active ?? { row, column }, { row, column })
      return true
    }
    return false
  }
  const clear = (): void => {
    if (!selection || readOnly) {
      return
    }
    const bounds = tableGridBounds(selection)
    const changes = table.rows.flatMap((row, index) =>
      index < bounds.top || index > bounds.bottom
        ? []
        : row.cells
            .slice(bounds.left, bounds.right + 1)
            .filter((cell) => !cell.missing)
            .map((cell) => ({ from: cell.from, to: cell.to, insert: '' }))
    )
    view.dispatch({
      changes,
      effects: selectTableGrid.of(selection),
      userEvent: 'input',
      annotations: isolateHistory.of('full')
    })
  }
  const onCopy = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (!selection) {
      return
    }
    const content = tableGridClipboard(table, selection)
    event.clipboardData.setData('text/plain', content.plain)
    event.clipboardData.setData('text/html', content.html)
    event.preventDefault()
    event.stopPropagation()
  }
  const onCut = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (selection && !readOnly) {
      onCopy(event)
      clear()
    }
  }
  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (!selection || readOnly) {
      return
    }
    const bounds = tableGridBounds(selection)
    const parsed = tableClipboardGrid(event.clipboardData)
    const value = event.clipboardData.getData('text/plain')
    const grid =
      parsed ??
      Array.from({ length: bounds.bottom - bounds.top + 1 }, () =>
        Array.from({ length: bounds.right - bounds.left + 1 }, () => value)
      )
    view.dispatch(
      pasteTableGridTransaction(view.state, table, { row: bounds.top, column: bounds.left }, grid)
    )
    event.preventDefault()
    event.stopPropagation()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (
      !selection ||
      event.target instanceof HTMLTextAreaElement ||
      event.nativeEvent.isComposing
    ) {
      return
    }
    const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
    const movement = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    }[event.key]
    if (modifier && event.key.toLowerCase() === 'a') {
      select({ row: 0, column: 0 }, { row: table.rows.length - 1, column: table.align.length - 1 })
    } else if (event.key === 'Escape') {
      view.dispatch({
        selection: { anchor: table.to },
        effects: [selectTableGrid.of(null), selectTableCell.of(null)]
      })
      view.focus()
    } else if (event.key === 'Enter' || event.key === 'F2') {
      focus(selection.head.row, selection.head.column)
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      clear()
    } else if (movement) {
      const head = {
        row: Math.max(0, Math.min(table.rows.length - 1, selection.head.row + movement[0])),
        column: Math.max(0, Math.min(table.align.length - 1, selection.head.column + movement[1]))
      }
      select(event.shiftKey ? selection.anchor : head, head)
    } else if (!modifier || !runScopeHandlers(view, event.nativeEvent, 'editor')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }
  const dragStart = (event: DragEvent, axis: 'row' | 'column', index: number): void => {
    if (readOnly) {
      event.preventDefault()
      return
    }
    setDragging(true)
    drag.current = { id: crypto.randomUUID(), axis, index, document: view.state.doc }
    event.dataTransfer.setData(dragType, drag.current.id)
    event.dataTransfer.effectAllowed = 'move'
    event.stopPropagation()
  }
  const dragOver = (event: DragEvent): void => {
    if (!readOnly && event.dataTransfer.types.includes(dragType)) {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
    }
  }
  const drop = (event: DragEvent, axis: 'row' | 'column', index: number): void => {
    const value = event.dataTransfer.getData(dragType)
    if (!value || readOnly) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const source = drag.current
    drag.current = null
    if (source?.id === value && source.axis === axis && source.document === view.state.doc) {
      view.dispatch(reorderTableTransaction(view.state, table, axis, source.index, index))
    }
  }
  return {
    container,
    dragging,
    dragEnd: () => {
      drag.current = null
      setDragging(false)
    },
    selection,
    select,
    clear,
    click,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onCopy,
    onCut,
    onPaste,
    onKeyDown,
    dragStart,
    dragOver,
    drop,
    dropAtCell: (event: DragEvent) => {
      const cell = cellAt(event.target instanceof Element ? event.target : null)
      const axis = drag.current?.axis
      if (cell && axis) {
        drop(event, axis, axis === 'row' ? cell.row : cell.column)
      }
    }
  }
}
