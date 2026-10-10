import { Fragment, type ResolvedPos } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'

export function getRichMarkdownSoftLine($from: ResolvedPos): {
  from: number
  to: number
  textBefore: string
} {
  let from = 0
  let to = $from.parent.content.size
  $from.parent.forEach((node, offset) => {
    if (node.type.name !== 'hardBreak') {
      return
    }
    if (offset < $from.parentOffset) {
      from = offset + node.nodeSize
    } else if (to === $from.parent.content.size) {
      to = offset
    }
  })
  return {
    from,
    to,
    textBefore: $from.parent.textBetween(from, $from.parentOffset, '\0', '\0')
  }
}

export function isolateRichMarkdownSoftLine(tr: Transaction): boolean {
  const { selection } = tr
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false
  }
  const { $from } = selection
  const paragraph = $from.parent
  if (paragraph.type.name !== 'paragraph') {
    return false
  }
  const line = getRichMarkdownSoftLine($from)
  if (line.from === 0 && line.to === paragraph.content.size) {
    return false
  }

  const before = line.from > 0 ? paragraph.copy(paragraph.content.cut(0, line.from - 1)) : null
  const current = paragraph.copy(paragraph.content.cut(line.from, line.to))
  const after =
    line.to < paragraph.content.size ? paragraph.copy(paragraph.content.cut(line.to + 1)) : null
  const nodes = [before, current, after].filter((node) => node !== null)
  const index = $from.index($from.depth - 1)
  if (!$from.node(-1).canReplace(index, index + 1, Fragment.fromArray(nodes))) {
    return false
  }

  const start = $from.before()
  const cursor = start + (before?.nodeSize ?? 0) + 1 + $from.parentOffset - line.from
  tr.replaceWith(start, $from.after(), nodes)
  tr.setSelection(TextSelection.create(tr.doc, cursor))
  return true
}
