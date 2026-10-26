import { countColumn, type StateCommand } from '@codemirror/state'
import { markdownCodeBlockAt } from './markdown-inline-format'
import { markdownContainerPrefix } from './markdown-container-prefix'
import { markdownListBreakPrefix } from './markdown-list-breaks'
import { markdownEditorMode } from './editor-context'

export const insertMarkdownSoftBreak: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) {
    return false
  }
  const selection = state.selection.main
  const code = markdownCodeBlockAt(state, selection.from)
  let prefix = markdownContainerPrefix(state, selection.from)
  if (code) {
    for (let parent = code.parent; parent; parent = parent.parent) {
      const mark = parent.name === 'ListItem' ? parent.getChild('ListMark') : null
      if (mark) {
        const line = state.doc.lineAt(mark.from)
        const space = state.sliceDoc(mark.to, line.to).match(/^[\t ]+/)?.[0] ?? ' '
        const required =
          state.sliceDoc(line.from, mark.from) + ' '.repeat(mark.to - mark.from) + space
        if (countColumn(prefix, 4) < countColumn(required, 4)) {
          prefix = required
        }
        break
      }
    }
  } else if (state.facet(markdownEditorMode) === 'source') {
    const line = state.doc.lineAt(selection.from)
    const marker = line.text.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/)
    prefix = marker ? ' '.repeat(marker[0].length) : ''
  } else {
    prefix = markdownListBreakPrefix(state, selection.from) ?? prefix
  }
  const insert = (code ? '\n' : '  \n') + prefix
  dispatch(
    state.update({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + insert.length },
      userEvent: 'input'
    })
  )
  return true
}
