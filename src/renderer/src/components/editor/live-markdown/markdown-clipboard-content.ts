import DOMPurify from 'dompurify'
import { marked } from 'marked'

function renderedText(node: Node): string {
  if (node.nodeType === 3) {
    if (
      !node.textContent?.trim() &&
      /^(BODY|TABLE|THEAD|TBODY|TFOOT|TR|UL|OL|BLOCKQUOTE)$/.test(node.parentElement?.tagName ?? '')
    ) {
      return ''
    }
    return node.textContent ?? ''
  }
  const element = node.nodeType === 1 ? (node as Element) : null
  const tag = element?.tagName.toLowerCase()
  if (tag === 'img') {
    return element?.getAttribute('alt') ?? ''
  }
  if (tag === 'br') {
    return '\n'
  }
  if (tag === 'pre') {
    return `${element?.textContent ?? ''}\n`
  }
  const content = Array.from(node.childNodes).map(renderedText).join('')
  if (tag === 'td' || tag === 'th') {
    return `${content.trimEnd()}\t`
  }
  return tag && /^(p|div|h[1-6]|li|tr|blockquote|ul|ol|table)$/.test(tag)
    ? `${content.replace(/\t$/, '').trimEnd()}\n`
    : content
}

export function markdownClipboardContent(
  source: string,
  definitions = ''
): { plain: string; html: string } {
  const html = DOMPurify.sanitize(marked.parse(`${source}\n\n${definitions}`, { async: false }))
  const document = new DOMParser().parseFromString(html, 'text/html')
  return {
    html,
    plain: renderedText(document.body)
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n+$/, '')
  }
}
