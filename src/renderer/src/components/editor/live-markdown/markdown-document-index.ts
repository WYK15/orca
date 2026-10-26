import type { ChangeDesc, EditorState } from '@codemirror/state'
import { TreeFragment, type ChangedRange, type Tree } from '@lezer/common'
import { parser, GFM } from '@lezer/markdown'
import { markdownDocumentSyntax } from './markdown-document-syntax'

const documentParser = parser.configure([GFM, markdownDocumentSyntax])
export function parseMarkdownDocumentIndex(
  state: EditorState,
  previous?: Tree,
  changes?: ChangeDesc
): Tree {
  const ranges: ChangedRange[] = []
  changes?.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({ fromA, toA, fromB, toB }))
  const fragments = previous
    ? TreeFragment.applyChanges(TreeFragment.addTree(previous), ranges)
    : []
  // Navigation and references must cover text beyond the viewport parser's budget.
  return documentParser.parse(state.doc.toString(), fragments)
}
