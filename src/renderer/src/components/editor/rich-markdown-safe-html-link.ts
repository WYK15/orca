import { safeHtmlDomMatchesFragment } from './rich-markdown-safe-html-dom'
import {
  parseRichMarkdownSafeHtml,
  type RichMarkdownSafeHtmlNode
} from './rich-markdown-safe-html-source'

export function findRichMarkdownSafeHtmlHref(
  source: string,
  clickedElement: Element | null,
  safeHtmlRoot: HTMLElement
): string | null {
  if (!clickedElement || !safeHtmlRoot.contains(clickedElement)) {
    return null
  }
  const projectedRoot = safeHtmlRoot.hasAttribute('data-rich-markdown-safe-html-node')
    ? safeHtmlRoot.firstElementChild
    : safeHtmlRoot
  if (!(projectedRoot instanceof HTMLElement)) {
    return null
  }
  const clickedAnchor = clickedElement.closest('a')
  if (!clickedAnchor || !projectedRoot.contains(clickedAnchor)) {
    return null
  }
  const parsed = parseRichMarkdownSafeHtml(source)
  if (!parsed || !safeHtmlDomMatchesFragment(projectedRoot, parsed, [])) {
    return null
  }
  const renderedAnchors = [
    ...(projectedRoot.matches('a') ? [projectedRoot] : []),
    ...projectedRoot.querySelectorAll('a')
  ]
  const clickedIndex = renderedAnchors.indexOf(clickedAnchor)
  if (clickedIndex === -1) {
    return null
  }
  return collectSafeHtmlHrefs(parsed.root)[clickedIndex] ?? null
}

function collectSafeHtmlHrefs(node: RichMarkdownSafeHtmlNode): string[] {
  if (node.type === 'text') {
    return []
  }
  const ownHref = node.tagName === 'a' ? node.attributes.href : undefined
  return [
    ...(ownHref ? [ownHref] : []),
    ...node.children.flatMap((child) => collectSafeHtmlHrefs(child))
  ]
}
