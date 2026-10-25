import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react'
import { runScopeHandlers, type EditorView } from '@codemirror/view'
import { undo, redo, isolateHistory } from '@codemirror/commands'
import { editTableCell, type MarkdownTable, type TableStructureAction } from './table-source'
import { selectTableCell, tableCellSelection } from './table-cell-selection'
import { registerTableCellInput } from './table-cell-command-target'
import { tableClipboardGrid } from './table-clipboard-grid'
import { pasteTableGridTransaction } from './table-paste-transactions'
import {
  markdownFromClipboardHtml,
  requestPlainMarkdownPaste,
  consumePlainMarkdownPaste
} from './clipboard-markdown'
import { markdownClipboardContent } from './markdown-clipboard-content'
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
  const commandSelection = useRef<{ from: number; to: number } | null>(null)
  useLayoutEffect(() => setDraft(sourceValue), [sourceValue])
  useLayoutEffect(() => {
    if (!input.current || activeRow === undefined || menuOpen || draft !== sourceValue || !owned) {
      return
    }
    if (input.current === document.activeElement && !caret.current && !commandSelection.current) {
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
    input.current.setSelectionRange(
      commandSelection.current?.from ?? at,
      commandSelection.current?.to ?? at
    )
    caret.current = null
    commandSelection.current = null
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
  const change = (value: string, isolated = false): void => {
    if (!active || readOnly) {
      return
    }
    setDraft(value)
    const selected = view.state.field(tableCellSelection)
    const edit = editTableCell(table, active.row, active.column, value)
    if (selected && edit && view.state.sliceDoc(selected.from, selected.to) !== edit.insert) {
      view.dispatch({
        changes: { ...edit, ...selected },
        userEvent: isolated ? 'input' : 'input.type',
        annotations: isolated ? isolateHistory.of('full') : undefined
      })
    }
  }
  useLayoutEffect(() => {
    if (!active || !input.current || readOnly) {
      return
    }
    return registerTableCellInput(view, {
      element: input.current,
      apply: (transaction) => {
        commandSelection.current = {
          from: transaction.newSelection.main.from,
          to: transaction.newSelection.main.to
        }
        change(transaction.newDoc.toString(), true)
      }
    })
  })
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
    if (modifier && event.shiftKey && key === 'v') {
      requestPlainMarkdownPaste(view)
      return
    }
    if (modifier && key === 'z') {
      event.preventDefault()
      ;(event.shiftKey ? redo : undo)(view)
      if (!view.state.field(tableCellSelection)) {
        view.focus()
      }
    } else if (modifier && ['s', 'f', '/', 'b', 'i', 'k', 'c', '`', '~', '\\'].includes(key)) {
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
  const replaceInputSelection = (element: HTMLTextAreaElement, insert: string): void => {
    const at = element.selectionStart
    commandSelection.current = { from: at + insert.length, to: at + insert.length }
    change(element.value.slice(0, at) + insert + element.value.slice(element.selectionEnd), true)
  }
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const plainOnly = consumePlainMarkdownPaste(view)
    if (!active || readOnly) {
      return
    }
    const grid = plainOnly ? null : tableClipboardGrid(event.clipboardData)
    if (grid) {
      event.preventDefault()
      view.dispatch(pasteTableGridTransaction(view.state, table, active, grid))
      return
    }
    const html = event.clipboardData.getData('text/html')
    const text =
      !plainOnly && html
        ? markdownFromClipboardHtml(html)
        : event.clipboardData.getData('text/plain')
    if (text) {
      event.preventDefault()
      replaceInputSelection(event.currentTarget, text)
    }
  }
  const onCopy = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const element = event.currentTarget
    if (element.selectionStart === element.selectionEnd) {
      return
    }
    const content = markdownClipboardContent(
      element.value.slice(element.selectionStart, element.selectionEnd)
    )
    event.clipboardData.setData('text/plain', content.plain)
    event.clipboardData.setData('text/html', content.html)
    event.preventDefault()
  }
  const onCut = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const element = event.currentTarget
    if (readOnly || element.selectionStart === element.selectionEnd) {
      return
    }
    onCopy(event)
    replaceInputSelection(element, '')
  }
  return {
    active,
    input,
    draft,
    focus,
    change,
    structure,
    onKeyDown,
    onPaste,
    onCopy,
    onCut,
    setMenuOpen,
    restoreFocus
  }
}
