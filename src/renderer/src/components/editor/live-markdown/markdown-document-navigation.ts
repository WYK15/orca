import { EditorView } from '@codemirror/view'
import { readMarkdownDocument } from './markdown-document-model'

export function navigateMarkdownSource(view: EditorView, position: number): void {
  const anchor = Math.max(0, Math.min(position, view.state.doc.length))
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: 'center' })
  })
  if (!view.state.readOnly) {
    view.focus()
  }
}

export function navigateMarkdownAnchor(view: EditorView, href: string): boolean {
  if (!href.startsWith('#')) {
    return false
  }
  let anchor: string
  try {
    anchor = decodeURIComponent(href.slice(1))
  } catch {
    return false
  }
  const heading = readMarkdownDocument(view.state).headings.find((item) => item.id === anchor)
  if (!heading) {
    return false
  }
  navigateMarkdownSource(view, heading.from)
  return true
}
