import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { runScopeHandlers, type EditorView } from '@codemirror/view'
import { undo, redo } from '@codemirror/commands'
import { editTableCell, type MarkdownTable, type TableStructureAction } from './table-source'
import { selectTableCell, tableCellSelection } from './table-cell-selection'
import {
  findTableCell,
  selectCellTransaction,
  tableStructureTransaction
} from './table-edit-transactions'

function decodeCell(value: string): string {
  return value.replace(/\\\|/g, '|').replace(/<br\s*\/?\s*>/gi, '\n')
}

export function useTableCellEditor(table: MarkdownTable, view: EditorView, readOnly: boolean) {
  const input = useRef<HTMLTextAreaElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const owned = view.state.field(tableCellSelection)
  const active = findTableCell(table, owned)
  const activeRow = active?.row
  const activeColumn = active?.column
  const sourceValue = active && owned ? decodeCell(view.state.sliceDoc(owned.from, owned.to)) : ''
  const [draft, setDraft] = useState(sourceValue)
  const selectionHead = view.state.selection.main.head
  const caret = useRef<'start' | 'end' | null>(null)
  useLayoutEffect(() => setDraft(sourceValue), [sourceValue])
  useLayoutEffect(() => {
    if (!input.current || activeRow === undefined || menuOpen || draft !== sourceValue || !owned) {
      return
    }
    if (input.current === document.activeElement && !caret.current) {
      return
    }
    input.current.focus({ preventScroll: true })
    const at =
      caret.current === 'end'
        ? input.current.value.length
        : caret.current === 'start'
          ? 0
          : decodeCell(
              view.state.sliceDoc(
                owned.from,
                Math.max(owned.from, Math.min(selectionHead, owned.to))
              )
            ).length
    input.current.setSelectionRange(at, at)
    caret.current = null
  }, [activeRow, activeColumn, menuOpen, draft, sourceValue, selectionHead, owned, view])
  useLayoutEffect(() => {
    if (input.current) {
      input.current.style.height = 'auto'
      input.current.style.height = `${input.current.scrollHeight}px`
      view.requestMeasure()
    }
  }, [draft, view])

  const focus = (row: number, column: number, edge: 'start' | 'end' = 'end'): void => {
    if (readOnly) {
      return
    }
    caret.current = edge
    view.dispatch(selectCellTransaction(view.state, table, { row, column }))
  }
  const structure = (
    action: TableStructureAction,
    target = active ?? { row: table.rows.length - 1, column: 0 }
  ): void => {
    if (readOnly) {
      return
    }
    caret.current = 'start'
    view.dispatch(tableStructureTransaction(view.state, table, target, action))
    if (!view.state.field(tableCellSelection)) {
      view.focus()
    }
  }
  const change = (value: string): void => {
    if (!active || readOnly) {
      return
    }
    setDraft(value)
    const selected = view.state.field(tableCellSelection)
    const edit = editTableCell(table, active.row, active.column, value)
    if (selected && edit && view.state.sliceDoc(selected.from, selected.to) !== edit.insert) {
      view.dispatch({ changes: { ...edit, ...selected }, userEvent: 'input.type' })
    }
  }
  const exit = (before = false): void => {
    const at = before ? table.from : table.to
    const line = view.state.doc.lineAt(at)
    const insert = before ? at === 0 : at === view.state.doc.length
    view.dispatch({
      changes: insert ? { from: at, insert: '\n\n' } : undefined,
      selection: {
        anchor: insert
          ? before
            ? 0
            : at + 2
          : before
            ? Math.max(0, line.from - 1)
            : Math.min(line.to + 1, view.state.doc.length)
      },
      effects: selectTableCell.of(null),
      userEvent: insert ? 'input' : 'select',
      scrollIntoView: true
    })
    view.focus()
  }
  const move = (delta: number): void => {
    if (!active) {
      return
    }
    const width = table.delimiter.cells.length
    const target = active.row * width + active.column + delta
    if (target < 0) {
      exit(true)
    } else if (target >= table.rows.length * width) {
      structure('row-after', { row: active.row, column: target % width })
    } else {
      focus(Math.floor(target / width), target % width, delta < 0 ? 'end' : 'start')
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
    const key = event.key.toLowerCase()
    if (modifier && key === 'z') {
      event.preventDefault()
      ;(event.shiftKey ? redo : undo)(view)
      if (!view.state.field(tableCellSelection)) {
        view.focus()
      }
    } else if (modifier && (key === 's' || key === 'f' || key === '/')) {
      if (runScopeHandlers(view, event.nativeEvent, 'editor')) {
        event.preventDefault()
      }
    } else if (modifier && event.key === 'Enter') {
      event.preventDefault()
      structure('row-after')
    } else if (modifier && event.shiftKey && event.key === 'Backspace') {
      event.preventDefault()
      structure('delete-row')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      exit()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      move(event.shiftKey ? -1 : 1)
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      move(table.delimiter.cells.length)
    } else if (
      !modifier &&
      !event.shiftKey &&
      event.currentTarget.selectionStart === event.currentTarget.selectionEnd
    ) {
      const position = event.currentTarget.selectionStart
      if (event.key === 'ArrowLeft' && position === 0) {
        event.preventDefault()
        move(-1)
      } else if (event.key === 'ArrowRight' && position === draft.length) {
        event.preventDefault()
        move(1)
      } else if (
        event.key === 'ArrowUp' &&
        !draft.slice(0, position).includes('\n') &&
        active &&
        active.row > 0
      ) {
        event.preventDefault()
        focus(active.row - 1, active.column)
      } else if (
        event.key === 'ArrowDown' &&
        !draft.slice(position).includes('\n') &&
        active &&
        active.row < table.rows.length - 1
      ) {
        event.preventDefault()
        focus(active.row + 1, active.column, 'start')
      }
    }
  }
  const restoreFocus = (event: Event): void => {
    event.preventDefault()
    setMenuOpen(false)
    requestAnimationFrame(() => {
      if (view.dom.isConnected) {
        if (view.state.field(tableCellSelection) && input.current) {
          input.current.focus({ preventScroll: true })
        } else {
          view.focus()
        }
      }
    })
  }
  return { active, input, draft, focus, change, structure, onKeyDown, setMenuOpen, restoreFocus }
}
