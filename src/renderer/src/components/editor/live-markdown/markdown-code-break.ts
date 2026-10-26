import { ChangeSet, countColumn, type ChangeSpec, type StateCommand } from '@codemirror/state'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { markdownCodeBlockAt } from './markdown-inline-format'
import { markdownContainerPrefix } from './markdown-container-prefix'
import { markdownEditorMode } from './editor-context'

export const insertQuotedCodeBreak: StateCommand = ({ state, dispatch }) => {
  if (
    state.readOnly ||
    state.selection.ranges.length !== 1 ||
    state.facet(markdownEditorMode) !== 'live'
  ) {
    return false
  }
  const selection = state.selection.main
  const code = markdownCodeBlockAt(state, selection.from)
  const currentPrefix = markdownContainerPrefix(state, selection.from)
  if (!code || !currentPrefix.includes('>')) {
    return false
  }
  const first = state.doc.lineAt(code.from)
  const base = state.sliceDoc(first.from, code.from).replace(/[^\t >]/g, ' ')
  const extra = markdownLanguage.isActiveAt(state, selection.from)
    ? Math.max(0, countColumn(currentPrefix, 4) - countColumn(base, 4))
    : 0
  return insertNewlineAndIndent({
    state,
    dispatch(transaction) {
      const prefixes: ChangeSpec[] = []
      transaction.changes.iterChanges((_from, _to, from, _end, inserted) => {
        const text = inserted.toString()
        for (const match of text.matchAll(/\n([\t ]*)/g)) {
          prefixes.push({
            from: from + match.index + 1,
            insert: base + ' '.repeat(Math.max(0, extra - countColumn(match[1], 4)))
          })
        }
      })
      const additions = ChangeSet.of(prefixes, transaction.newDoc.length)
      dispatch(
        state.update({
          changes: transaction.changes.compose(additions),
          selection: transaction.newSelection.map(additions, 1),
          userEvent: 'input',
          scrollIntoView: true
        })
      )
    }
  })
}
