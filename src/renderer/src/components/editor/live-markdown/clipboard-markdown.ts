import type { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { markdownEditorMode } from './editor-context'
import { markdownClipboardContent } from './markdown-clipboard-content'
import { markdownLinkDefinitions } from './markdown-links'

const plainPasteUntil = new WeakMap<EditorView, number>()
export function requestPlainMarkdownPaste(view: EditorView): void {
  plainPasteUntil.set(view, Date.now() + 1000)
}
export function consumePlainMarkdownPaste(view: EditorView): boolean {
  const expires = plainPasteUntil.get(view) ?? 0
  plainPasteUntil.delete(view)
  return Date.now() <= expires
}

function convertNode(node: Node): string {
  if (node.nodeType === 3) {
    return (node.textContent ?? '').replace(/[\\`*_~[\]<]/g, '\\$&')
  }
  if (node.nodeType !== 1 && node.nodeType !== 11) {
    return ''
  }
  const element = node.nodeType === 1 ? (node as Element) : null
  const tag = element?.tagName.toLowerCase()
  if (tag && ['script', 'style', 'iframe', 'object', 'embed', 'template'].includes(tag)) {
    return ''
  }
  const content = Array.from(node.childNodes).map(convertNode).join('')
  if (!tag) {
    return content
  }
  if (/^h[1-6]$/.test(tag)) {
    return `\n\n${'#'.repeat(Number(tag[1]))} ${content.trim()}\n\n`
  }
  if (tag === 'strong' || tag === 'b') {
    return `**${content}**`
  }
  if (tag === 'em' || tag === 'i') {
    return `*${content}*`
  }
  if (tag === 'del' || tag === 's') {
    return `~~${content}~~`
  }
  if (tag === 'br') {
    return '  \n'
  }
  if (tag === 'p' || tag === 'div') {
    return `\n\n${content.trim()}\n\n`
  }
  if (tag === 'hr') {
    return '\n\n---\n\n'
  }
  if (tag === 'code' && element?.parentElement?.tagName.toLowerCase() !== 'pre') {
    const text = element?.textContent ?? ''
    const fence = text.includes('`') ? '``' : '`'
    return `${fence}${text}${fence}`
  }
  if (tag === 'pre') {
    const text = element?.textContent ?? ''
    const fence = '`'.repeat(
      Math.max(3, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1))
    )
    return `\n\n${fence}\n${text.replace(/\n$/, '')}\n${fence}\n\n`
  }
  if (tag === 'a') {
    return `[${content}](${element?.getAttribute('href') ?? ''})`
  }
  if (tag === 'img') {
    return `![${element?.getAttribute('alt') ?? ''}](${element?.getAttribute('src') ?? ''})`
  }
  if (tag === 'blockquote') {
    return `\n\n${content
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}\n\n`
  }
  if (tag === 'ul' || tag === 'ol') {
    return `\n\n${Array.from(element?.children ?? [])
      .map((item, index) => {
        const marker = tag === 'ol' ? `${index + 1}. ` : '- '
        return (
          marker +
          Array.from(item.childNodes).map(convertNode).join('').trim().replace(/\n/g, '\n  ')
        )
      })
      .join('\n')}\n\n`
  }
  if (tag === 'table') {
    const rows = Array.from(element?.querySelectorAll('tr') ?? []).map(
      (row) =>
        `| ${Array.from(row.children)
          .map((cell) => convertNode(cell).trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>'))
          .join(' | ')} |`
    )
    if (rows.length) {
      rows.splice(
        1,
        0,
        `| ${Array.from(element?.querySelector('tr')?.children ?? [], () => '---').join(' | ')} |`
      )
    }
    return `\n\n${rows.join('\n')}\n\n`
  }
  return content
}

export function markdownFromClipboardHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return convertNode(document.body)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function pasteClipboardMarkdown(event: ClipboardEvent, view: EditorView): boolean {
  if (consumePlainMarkdownPaste(view)) {
    return false
  }
  if (view.state.readOnly || view.state.facet(markdownEditorMode) !== 'live') {
    return false
  }
  const html = event.clipboardData?.getData('text/html')
  if (!html) {
    return false
  }
  let node = syntaxTree(view.state).resolveInner(view.state.selection.main.head, -1)
  while (node.parent) {
    if (node.name === 'InlineCode' || node.name === 'FencedCode' || node.name === 'CodeBlock') {
      return false
    }
    node = node.parent
  }
  const markdown = markdownFromClipboardHtml(html)
  if (!markdown) {
    return false
  }
  event.preventDefault()
  view.dispatch(view.state.replaceSelection(markdown), { userEvent: 'input.paste' })
  return true
}

export function copyClipboardMarkdown(event: ClipboardEvent, view: EditorView): boolean {
  const selection = view.state.selection.main
  if (selection.empty || !event.clipboardData) {
    return false
  }
  const text = view.state.sliceDoc(selection.from, selection.to)
  if (view.state.facet(markdownEditorMode) === 'source') {
    event.clipboardData.setData('text/plain', text)
  } else {
    const content = markdownClipboardContent(text, markdownLinkDefinitions(view.state))
    event.clipboardData.setData('text/plain', content.plain)
    event.clipboardData.setData('text/html', content.html)
  }
  event.preventDefault()
  return true
}

export function cutClipboardMarkdown(event: ClipboardEvent, view: EditorView): boolean {
  if (view.state.readOnly || !copyClipboardMarkdown(event, view)) {
    return false
  }
  view.dispatch(view.state.replaceSelection(''), { userEvent: 'delete.cut' })
  return true
}
