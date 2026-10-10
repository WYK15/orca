import type { Editor } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

export function removeEmptyBulletMarker(editor: Editor): boolean {
  const { state, view } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false
  }
  const { $from } = selection
  if (
    $from.depth < 3 ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parent.content.size !== 0 ||
    $from.node(-1).type.name !== 'listItem' ||
    $from.node(-1).childCount !== 1 ||
    $from.node(-2).type.name !== 'bulletList'
  ) {
    return false
  }

  const listDepth = $from.depth - 2
  const itemDepth = $from.depth - 1
  const list = $from.node(listDepth)
  const index = $from.index(listDepth)
  const tr = state.tr
  if (index > 0) {
    const previous = list.child(index - 1)
    const last = previous.lastChild!
    const content =
      last.type.name === 'paragraph'
        ? previous.content
            .cut(0, previous.content.size - last.nodeSize)
            .append(
              Fragment.from(
                last.copy(last.content.append(Fragment.from(state.schema.nodes.hardBreak.create())))
              )
            )
        : previous.content.append(Fragment.from(state.schema.nodes.paragraph.create()))
    const replacement = previous.copy(content)
    const from = $from.before(itemDepth) - previous.nodeSize
    tr.replaceWith(from, $from.after(itemDepth), replacement)
    tr.setSelection(TextSelection.create(tr.doc, from + replacement.nodeSize - 2))
  } else {
    const paragraph = state.schema.nodes.paragraph.create()
    const rest = list.content.cut($from.node(itemDepth).nodeSize)
    const nodes = rest.size > 0 ? [paragraph, list.copy(rest)] : [paragraph]
    const from = $from.before(listDepth)
    tr.replaceWith(from, $from.after(listDepth), nodes)
    tr.setSelection(TextSelection.create(tr.doc, from + 1))
  }
  tr.setStoredMarks([])
  view.dispatch(tr.scrollIntoView())
  return true
}
