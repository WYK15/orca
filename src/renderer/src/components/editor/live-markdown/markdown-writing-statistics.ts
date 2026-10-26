import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

export type MarkdownWritingStatistics = { words: number; characters: number }
export function markdownWritingStatistics(
  state: EditorState,
  from = 0,
  to = state.doc.length
): MarkdownWritingStatistics {
  const skipped: { from: number; to: number }[] = []
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (
        [
          'FrontMatter',
          'FootnoteReference',
          'InlineMath',
          'DisplayMath',
          'HTMLTag',
          'CommentBlock',
          'InlineHtmlComment',
          'LinkReference',
          'DocumentToc',
          'HeaderMark',
          'EmphasisMark',
          'CodeMark',
          'CodeInfo',
          'ListMark',
          'QuoteMark',
          'TaskMarker',
          'LinkMark',
          'LinkLabel',
          'LinkTitle',
          'URL',
          'HorizontalRule'
        ].includes(node.name)
      ) {
        skipped.push({ from: Math.max(from, node.from), to: Math.min(to, node.to) })
        return false
      }
      return undefined
    }
  })
  let at = from
  const chunks: string[] = []
  for (const range of skipped) {
    if (range.from >= at) {
      chunks.push(state.sliceDoc(at, range.from))
      at = range.to
    }
  }
  chunks.push(state.sliceDoc(at, to))
  const text = chunks
    .join('')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, ' ')
  return {
    words: Array.from(
      text
        .replace(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
          (character) => ` ${character} `
        )
        .matchAll(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
        )
    ).length,
    characters: Array.from(text.replace(/\s/g, '')).length
  }
}
