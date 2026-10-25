import type { EditorView } from '@codemirror/view'
import { MarkdownFragment } from './MarkdownFragment'

export function TableCellMarkdown(props: { content: string; view: EditorView }) {
  return <MarkdownFragment {...props} />
}
