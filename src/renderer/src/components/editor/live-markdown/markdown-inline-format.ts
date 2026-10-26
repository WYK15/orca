import { EditorSelection, type EditorState, type StateCommand } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { isolateHistory } from '@codemirror/commands'
import { readMarkdownDocumentTree } from './markdown-document-model'

export type MarkdownInlineFormat = '**' | '*' | '~~' | '`'
const names = { '**': 'StrongEmphasis', '*': 'Emphasis', '~~': 'Strikethrough', '`': 'InlineCode' }

export function markdownCodeBlockAt(
  state: EditorState,
  position = state.selection.main.head
): SyntaxNode | null {
  let node: SyntaxNode | null = readMarkdownDocumentTree(state).resolveInner(position, -1)
  while (node) {
    if (['FencedCode', 'CodeBlock', 'FrontMatter', 'DisplayMath'].includes(node.name)) {
      return node
    }
    node = node.parent
  }
  return null
}

function delimiters(state: EditorState, node: SyntaxNode): { opening: string; closing: string } {
  const children = node.getChildren(node.name === 'InlineCode' ? 'CodeMark' : 'EmphasisMark')
  const first = children[0]
  const last = children.at(-1)
  return {
    opening: first ? state.sliceDoc(first.from, first.to) : '~~',
    closing: last ? state.sliceDoc(last.from, last.to) : '~~'
  }
}

function formattedNode(state: EditorState, format: MarkdownInlineFormat): SyntaxNode | null {
  const range = state.selection.main
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(range.from, 1)
  while (node) {
    if (node.name === names[format] && node.from <= range.from && node.to >= range.to) {
      return node
    }
    node = node.parent
  }
  return null
}

export function toggleMarkdownInline(format: MarkdownInlineFormat): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly || markdownCodeBlockAt(state)) {
      return false
    }
    const range = state.selection.main
    const node = formattedNode(state, format)
    if (node) {
      const { opening, closing } = delimiters(state, node)
      const from = node.from + opening.length
      const to = node.to - closing.length
      const partial = (!range.empty && range.from > from) || (!range.empty && range.to < to)
      if (partial && range.from >= from && range.to <= to) {
        const before = state.sliceDoc(from, range.from)
        const after = state.sliceDoc(range.to, to)
        const leading = before.slice(before.trimEnd().length)
        const trailing = after.slice(0, after.length - after.trimStart().length)
        const prefix = before.trimEnd() ? `${opening}${before.trimEnd()}${closing}` : ''
        const suffix = after.trimStart() ? `${opening}${after.trimStart()}${closing}` : ''
        const selected = state.sliceDoc(range.from, range.to)
        const insert = `${prefix}${leading}${selected}${trailing}${suffix}`
        const anchor = node.from + prefix.length + leading.length
        dispatch(
          state.update({
            changes: { from: node.from, to: node.to, insert },
            selection: { anchor, head: anchor + selected.length },
            userEvent: 'input',
            annotations: isolateHistory.of('full')
          })
        )
      } else {
        const changes = state.changes([
          { from: node.from, to: from },
          { from: to, to: node.to }
        ])
        dispatch(
          state.update({
            changes,
            selection: EditorSelection.range(changes.mapPos(range.from), changes.mapPos(range.to)),
            userEvent: 'input',
            annotations: isolateHistory.of('full')
          })
        )
      }
      return true
    }
    if (
      range.empty &&
      state.sliceDoc(Math.max(0, range.from - format.length), range.from) === format &&
      state.sliceDoc(range.to, range.to + format.length) === format
    ) {
      dispatch(
        state.update({
          changes: [
            { from: range.from - format.length, to: range.from },
            { from: range.to, to: range.to + format.length }
          ],
          selection: { anchor: range.from - format.length, head: range.to - format.length },
          userEvent: 'input',
          annotations: isolateHistory.of('full')
        })
      )
      return true
    }
    let text = state.sliceDoc(range.from, range.to)
    if (format !== '`') {
      const remove: { from: number; to: number }[] = []
      syntaxTree(state).iterate({
        from: range.from,
        to: range.to,
        enter(current) {
          if (
            current.name === names[format] &&
            current.from >= range.from &&
            current.to <= range.to
          ) {
            const marks = delimiters(state, current.node)
            remove.push(
              {
                from: current.from - range.from,
                to: current.from - range.from + marks.opening.length
              },
              { from: current.to - range.from - marks.closing.length, to: current.to - range.from }
            )
          }
        }
      })
      for (const edit of remove.toSorted((a, b) => b.from - a.from)) {
        text = text.slice(0, edit.from) + text.slice(edit.to)
      }
    }
    const leading = text.match(/^\s*/)?.[0] ?? ''
    const trailing = text.slice(leading.length).match(/\s*$/)?.[0] ?? ''
    const content = text.slice(leading.length, text.length - trailing.length)
    const marker =
      format === '`'
        ? '`'.repeat(
            Math.max(1, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length + 1))
          )
        : format
    const padding = format === '`' && /^`|`$/.test(content) ? ' ' : ''
    const insert = `${leading}${marker}${padding}${content}${padding}${marker}${trailing}`
    const anchor = range.from + leading.length + marker.length + padding.length
    dispatch(
      state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor, head: anchor + content.length },
        userEvent: 'input',
        annotations: isolateHistory.of('full')
      })
    )
    return true
  }
}
