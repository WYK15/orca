import type { EditorState, StateCommand } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { markdownCodeBlockAt } from './markdown-inline-format'
import { parseMarkdownTable, parseTableRow } from './table-source'
import { selectTableCell } from './table-cell-selection'

function protectedBlockLine(state: EditorState, position: number): boolean {
  let node = syntaxTree(state).resolveInner(position, 1)
  while (node.parent) {
    if (['FencedCode', 'CodeBlock', 'Table'].includes(node.name)) {
      return true
    }
    node = node.parent
  }
  return false
}

export function setMarkdownHeading(level: number): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly || markdownCodeBlockAt(state)) {
      return false
    }
    const selected = state.selection.main
    const first = state.doc.lineAt(selected.from)
    const last = state.doc.lineAt(
      selected.empty ? selected.to : Math.max(selected.from, selected.to - 1)
    )
    const changes: { from: number; to: number; insert: string }[] = []
    for (let number = first.number; number <= last.number; number++) {
      const line = state.doc.line(number)
      if (protectedBlockLine(state, line.from) || (!selected.empty && !line.text.trim())) {
        continue
      }
      const prefix = line.text.match(/^( {0,3}(?:>\s*)*)(?:#{1,6}(?:[\t ]+|$))?/)
      const keep = prefix?.[1] ?? ''
      changes.push({
        from: line.from + keep.length,
        to: line.from + (prefix?.[0].length ?? 0),
        insert: level ? `${'#'.repeat(level)} ` : ''
      })
      let node = syntaxTree(state).resolveInner(line.to, -1)
      while (node.parent && !node.name.startsWith('SetextHeading')) {
        node = node.parent
      }
      const mark = node.name.startsWith('SetextHeading') ? node.getChild('HeaderMark') : null
      if (mark && state.doc.lineAt(mark.from).number > number) {
        changes.push({ from: state.doc.lineAt(mark.from).from - 1, to: mark.to, insert: '' })
        number = state.doc.lineAt(mark.from).number
      }
    }
    const changeSet = state.changes(changes)
    dispatch(
      state.update({
        changes: changeSet,
        selection: selected.map(changeSet),
        userEvent: 'input',
        annotations: isolateHistory.of('full')
      })
    )
    return true
  }
}

export function toggleMarkdownBlock(prefix: '- ' | '> ' | '1. ' | '- [ ] '): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly || markdownCodeBlockAt(state)) {
      return false
    }
    const selection = state.selection.main
    const first = state.doc.lineAt(selection.from).number
    const last = state.doc.lineAt(
      selection.empty ? selection.to : Math.max(selection.from, selection.to - 1)
    ).number
    const lines = Array.from({ length: last - first + 1 }, (_, offset) =>
      state.doc.line(first + offset)
    ).filter(
      (line) => !protectedBlockLine(state, line.from) && (selection.empty || line.text.trim())
    )
    const pattern = prefix === '> ' ? /^(\s*)>\s?/ : /^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/
    const remove = lines.every((line) => pattern.test(line.text))
    const changes = lines.map((line, index) => {
      const match = line.text.match(pattern)
      const indent = match?.[1] ?? line.text.match(/^\s*/)?.[0] ?? ''
      return {
        from: line.from + indent.length,
        to: line.from + (match?.[0].length ?? indent.length),
        insert: remove ? '' : prefix === '1. ' ? `${index + 1}. ` : prefix
      }
    })
    const changeSet = state.changes(changes)
    dispatch(
      state.update({
        changes: changeSet,
        selection: selection.map(changeSet),
        userEvent: 'input',
        annotations: isolateHistory.of('full')
      })
    )
    return true
  }
}

export function indentMarkdownList(outdent: boolean): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly || markdownCodeBlockAt(state) || !state.selection.main.empty) {
      return false
    }
    let node = syntaxTree(state).resolveInner(state.selection.main.head, -1)
    while (node.parent && node.name !== 'ListItem') {
      node = node.parent
    }
    if (node.name !== 'ListItem') {
      return false
    }
    const line = state.doc.lineAt(node.from)
    const nestedParent = node.parent?.parent
    const parentIndent =
      nestedParent?.name === 'ListItem'
        ? (state.doc.lineAt(nestedParent.from).text.match(/^\s*/)?.[0].length ?? 0)
        : -1
    const indent = line.text.match(/^\s*/)?.[0].length ?? 0
    if (outdent ? parentIndent < 0 : node.prevSibling?.name !== 'ListItem') {
      return true
    }
    const width = outdent
      ? Math.max(1, indent - parentIndent)
      : (line.text.match(/^\s*((?:[-+*]|\d+[.)])\s+)/)?.[1].length ?? 2)
    const last = state.doc.lineAt(node.to).number
    const changes = Array.from({ length: last - line.number + 1 }, (_, index) => {
      const current = state.doc.line(line.number + index)
      const spaces = current.text.match(/^\s*/)?.[0].length ?? 0
      return {
        from: current.from,
        to: current.from + (outdent ? Math.min(width, spaces) : 0),
        insert: outdent || !current.text ? '' : ' '.repeat(width)
      }
    })
    const changeSet = state.changes(changes)
    dispatch(
      state.update({
        changes: changeSet,
        selection: state.selection.map(changeSet),
        userEvent: 'input',
        annotations: isolateHistory.of('full')
      })
    )
    return true
  }
}

export const completeMarkdownTable: StateCommand = ({ state, dispatch }) => {
  const selection = state.selection.main
  const line = state.doc.lineAt(selection.head)
  if (
    state.readOnly ||
    !selection.empty ||
    selection.head !== line.to ||
    markdownCodeBlockAt(state) ||
    !/^ {0,3}\|.*\|\s*$/.test(line.text)
  ) {
    return false
  }
  let node = syntaxTree(state).resolveInner(selection.head, -1)
  while (node.parent) {
    if (node.name === 'Table') {
      return false
    }
    node = node.parent
  }
  const header = parseTableRow(line.text, line.from)
  if (!header.cells.length) {
    return false
  }
  const indent = line.text.match(/^ */)?.[0] ?? ''
  const insert = `\n${indent}| ${header.cells.map(() => '---').join(' | ')} |\n${indent}| ${header.cells.map(() => ' ').join(' | ')} |`
  const table = parseMarkdownTable(line.text + insert, 0, line.length + insert.length)!
  const cell = table.rows[1].cells[0]
  dispatch(
    state.update({
      changes: { from: line.to, insert },
      selection: { anchor: line.from + cell.from },
      effects: selectTableCell.of({ from: line.from + cell.from, to: line.from + cell.to }),
      userEvent: 'input',
      annotations: isolateHistory.of('full')
    })
  )
  return true
}
