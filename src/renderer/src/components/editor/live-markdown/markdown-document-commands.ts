import type { StateCommand } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { markdownEditorMode } from './editor-context'
import { markdownCodeBlockAt } from './markdown-inline-format'

export const markdownDocumentBreak: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly || state.facet(markdownEditorMode) === 'source') {
    return false
  }
  const selection = state.selection.main
  const line = state.doc.lineAt(selection.from)
  const block = markdownCodeBlockAt(state)
  const marker = line.text.trim()
  const create =
    selection.empty &&
    selection.head === line.to &&
    ((marker === '---' && line.number === 1 && block?.name !== 'FrontMatter') ||
      (marker === '$$' &&
        block?.from === line.from &&
        !/\n\s*\$\$\s*$/.test(state.sliceDoc(block.from, block.to))))
  let insert: string
  if (create) {
    insert = `\n\n${marker}`
  } else if (block?.name === 'FrontMatter' || block?.name === 'DisplayMath') {
    insert = `\n${line.text.match(/^[\t ]*/)?.[0] ?? ''}`
  } else {
    let node = syntaxTree(state).resolveInner(selection.from, -1)
    while (node.parent && node.name !== 'FootnoteDefinition') {
      node = node.parent
    }
    if (node.name !== 'FootnoteDefinition') {
      return false
    }
    if (!line.text.trim() && line.from > node.from) {
      dispatch(
        state.update({
          changes: { from: line.from, to: selection.to, insert: '\n' },
          selection: { anchor: line.from + 1 },
          userEvent: 'input'
        })
      )
      return true
    }
    insert = '\n    '
  }
  dispatch(
    state.update({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + (create ? 1 : insert.length) },
      userEvent: 'input'
    })
  )
  return true
}
