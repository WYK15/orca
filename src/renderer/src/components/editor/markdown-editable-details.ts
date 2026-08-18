import {
  createDetailsHtmlBlockMatcher,
  detailsBodyHtmlToMarkdown,
  extractDetailsSummaryHtml,
  isEditableDetailsHtmlBlock
} from './details-markdown-html'

export function stripEditableDetailsHtml(content: string): {
  content: string
  preservationContent: string
  didStrip: boolean
} {
  const matchDetails = createDetailsHtmlBlockMatcher(content)
  let sanitized = ''
  let preservationContent = ''
  let cursor = 0
  let didStrip = false
  while (cursor < content.length) {
    const tagStart = content.indexOf('<', cursor)
    if (tagStart === -1) {
      sanitized += content.slice(cursor)
      preservationContent += content.slice(cursor)
      break
    }
    sanitized += content.slice(cursor, tagStart)
    preservationContent += content.slice(cursor, tagStart)
    const block =
      content.slice(tagStart, tagStart + 8).toLowerCase() === '<details'
        ? matchDetails(tagStart)
        : null
    const summary =
      block && isEditableDetailsHtmlBlock(block) ? extractDetailsSummaryHtml(block.inner) : null
    if (!block || !summary) {
      sanitized += '<'
      preservationContent += '<'
      cursor = tagStart + 1
      continue
    }
    const body = detailsBodyHtmlToMarkdown(block.inner.slice(summary.rawLength))
    const nested = stripEditableDetailsHtml(body)
    sanitized += `${summary.content}\n${nested.content}`
    // Keep structural tags/attributes in the round-trip proof; only supported p/br may canonicalize away.
    preservationContent +=
      block.raw.slice(0, block.raw.indexOf('>') + 1) +
      block.inner.slice(0, summary.rawLength) +
      body +
      block.raw.slice(block.raw.lastIndexOf('<'))
    cursor = tagStart + block.raw.length
    didStrip = true
  }
  return { content: sanitized, preservationContent, didStrip }
}
