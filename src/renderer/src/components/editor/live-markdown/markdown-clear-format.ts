import type { EditorState, StateCommand } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { syntaxTree } from '@codemirror/language'
import {
  markdownCodeBlockAt,
  toggleMarkdownInline,
  type MarkdownInlineFormat
} from './markdown-inline-format'
import { isolateHistory } from '@codemirror/commands'

const formats: Record<string, MarkdownInlineFormat> = {
  StrongEmphasis: '**',
  Emphasis: '*',
  Strikethrough: '~~',
  InlineCode: '`'
}

function nextStyledNode(state: EditorState): SyntaxNode | null {
  const selected = state.selection.main
  let result: SyntaxNode | null = null
  syntaxTree(state).iterate({
    enter(node) {
      if (result || node.name === 'FencedCode' || node.name === 'CodeBlock') {
        return false
      }
      if (
        formats[node.name] &&
        (selected.empty
          ? selected.head > node.from && selected.head < node.to
          : (node.from >= selected.from && node.to <= selected.to) ||
            (node.from <= selected.from && node.to >= selected.to))
      ) {
        result = node.node
        return false
      }
      return undefined
    }
  })
  return result
}

export const clearMarkdownInlineFormat: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly || markdownCodeBlockAt(state)) {
    return false
  }
  let working = state
  let combined = state.changes([])
  let node: SyntaxNode | null
  while ((node = nextStyledNode(working))) {
    const selected = working.selection.main
    if (node.from <= selected.from && node.to >= selected.to) {
      const changed = toggleMarkdownInline(formats[node.name])({
        state: working,
        dispatch: (transaction) => {
          combined = combined.compose(transaction.changes)
          working = transaction.state
        }
      })
      if (!changed) {
        break
      }
    } else {
      const length =
        node.name === 'InlineCode'
          ? (working.sliceDoc(node.from, node.to).match(/^`+/)?.[0].length ?? 1)
          : formats[node.name].length
      const changes = working.changes([
        { from: node.from, to: node.from + length },
        { from: node.to - length, to: node.to }
      ])
      combined = combined.compose(changes)
      working = working.update({ changes, selection: selected.map(changes) }).state
    }
  }
  if (combined.empty) {
    return false
  }
  dispatch(
    state.update({
      changes: combined,
      selection: working.selection,
      userEvent: 'input',
      annotations: isolateHistory.of('full')
    })
  )
  return true
}
