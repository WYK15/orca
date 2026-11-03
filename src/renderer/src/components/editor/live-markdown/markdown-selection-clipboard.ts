import { EditorState } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import { markdownDocumentModel, readMarkdownDocumentTree } from './markdown-document-model'
import {
  markdownSourceLinks,
  markdownSourceImages,
  markdownLinkDefinitions
} from './markdown-links'
import { markdownClipboardContent } from './markdown-clipboard-content'

type Fragment = { plain: string; markdown: string }
const empty = (): Fragment => ({ plain: '', markdown: '' })
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function insideList(node: SyntaxNode): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === 'ListItem') {
      return true
    }
  }
  return false
}

export function projectMarkdownSelection(state: EditorState): Fragment {
  const selection = state.selection.main
  if (selection.from === 0 && selection.to === state.doc.length) {
    const source = state.doc.toString()
    return { plain: source, markdown: source }
  }
  const links = new Map(markdownSourceLinks(state).map((link) => [link.from, link]))
  const images = new Map(markdownSourceImages(state).map((image) => [image.from, image]))
  const raw = (from: number, to: number): Fragment => {
    const text = state.sliceDoc(from, to)
    return { plain: text, markdown: text }
  }
  const append = (target: Fragment, value: Fragment): void => {
    target.plain += value.plain
    target.markdown += value.markdown
  }
  const children = (node: SyntaxNode, from: number, to: number): Fragment => {
    const result = empty()
    let position = from
    for (let child = node.firstChild; child && child.from < to; child = child.nextSibling) {
      if (child.to <= from) {
        continue
      }
      const start = Math.max(from, child.from)
      if (start > position) {
        append(result, raw(position, start))
      }
      if (['ListMark', 'QuoteMark'].includes(child.name)) {
        const end = Math.min(
          to,
          child.to + (state.sliceDoc(child.to, to).match(/^[\t ]+/)?.[0].length ?? 0)
        )
        result.markdown += state.sliceDoc(start, end)
        position = end
      } else {
        append(result, project(child, start, Math.min(to, child.to)))
        position = Math.min(to, child.to)
      }
    }
    if (position < to) {
      append(result, raw(position, to))
    }
    return result
  }
  const project = (node: SyntaxNode, from: number, to: number): Fragment => {
    if (to <= from) {
      return empty()
    }
    if (['StrongEmphasis', 'Emphasis', 'Strikethrough', 'InlineCode'].includes(node.name)) {
      const code = node.name === 'InlineCode'
      const marks = code ? node.getChildren('CodeMark') : []
      const width = node.name === 'Emphasis' ? 1 : 2
      const contentFrom = code ? (marks[0]?.to ?? node.from) : node.from + width
      const contentTo = code ? (marks.at(-1)?.from ?? node.to) : node.to - width
      const start = Math.max(from, contentFrom),
        end = Math.min(to, contentTo)
      if (end <= start) {
        return empty()
      }
      const fragment = code ? raw(start, end) : children(node, start, end)
      const full = from <= contentFrom && to >= contentTo
      const tag = code
        ? 'code'
        : node.name === 'StrongEmphasis'
          ? 'strong'
          : node.name === 'Emphasis'
            ? 'em'
            : 'del'
      return {
        plain:
          full && !(code && insideList(node)) ? state.sliceDoc(node.from, node.to) : fragment.plain,
        markdown: `<${tag}>${code ? escapeHtml(fragment.plain) : fragment.markdown}</${tag}>`
      }
    }
    const link = links.get(node.from)
    if (link && ['Link', 'Autolink', 'URL'].includes(node.name)) {
      const start = Math.max(from, link.labelFrom),
        end = Math.min(to, link.labelTo)
      if (end <= start) {
        return empty()
      }
      const fragment = children(node, start, end)
      return {
        plain: fragment.plain,
        markdown: `<a href="${escapeHtml(link.href)}">${fragment.markdown}</a>`
      }
    }
    const image = node.name === 'Image' ? images.get(node.from) : undefined
    if (image) {
      return {
        plain: state.sliceDoc(node.from, node.to),
        markdown: `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}">`
      }
    }
    if (['FencedCode', 'CodeBlock'].includes(node.name)) {
      const content = node.getChildren('CodeText')
      if (!content.length) {
        return {
          plain: from <= node.from && to >= node.to ? state.sliceDoc(node.from, node.to) : '',
          markdown: '\n\n<pre><code></code></pre>\n\n'
        }
      }
      const start = Math.max(from, content[0]?.from ?? node.from)
      const end = Math.min(to, content.at(-1)?.to ?? node.to)
      if (end <= start) {
        return empty()
      }
      const text = state.sliceDoc(start, end)
      return {
        plain: from <= node.from && to >= node.to ? state.sliceDoc(node.from, node.to) : text,
        markdown: `\n\n<pre><code>${escapeHtml(text)}</code></pre>\n\n`
      }
    }
    if (node.name === 'Escape') {
      return {
        plain: state.sliceDoc(Math.max(from, node.from + 1), to),
        markdown: state.sliceDoc(from, to)
      }
    }
    if (node.name === 'Entity' || node.name === 'CharacterReference') {
      const text = document.createElement('textarea')
      text.innerHTML = state.sliceDoc(from, to)
      return { plain: text.value, markdown: state.sliceDoc(from, to) }
    }
    if (node.name === 'HeaderMark') {
      return { plain: '', markdown: state.sliceDoc(from, to) }
    }
    if (
      from <= node.from &&
      to >= node.to &&
      /^(?:BulletList|OrderedList|Blockquote|Table|(?:ATX|Setext)Heading\d)$/.test(node.name)
    ) {
      return {
        plain: state.sliceDoc(node.from, node.to),
        markdown: children(node, from, to).markdown
      }
    }
    return children(node, from, to)
  }
  return project(readMarkdownDocumentTree(state).topNode, selection.from, selection.to)
}

export function markdownSelectionClipboard(state: EditorState): { plain: string; html: string } {
  const result = projectMarkdownSelection(state)
  return {
    plain: result.plain,
    html: markdownClipboardContent(result.markdown, markdownLinkDefinitions(state)).html
  }
}

export function markdownTextSelectionClipboard(source: string, from: number, to: number) {
  return markdownSelectionClipboard(
    EditorState.create({
      doc: source,
      selection: { anchor: from, head: to },
      extensions: markdownDocumentModel
    })
  )
}
