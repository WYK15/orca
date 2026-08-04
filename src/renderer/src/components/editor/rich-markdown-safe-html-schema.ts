export const RICH_MARKDOWN_SAFE_HTML_INLINE_TAGS = new Set([
  'a',
  'span',
  'u',
  'mark',
  'sub',
  'sup',
  'kbd',
  'br'
])
export const RICH_MARKDOWN_SAFE_HTML_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

export type RichMarkdownSafeHtmlKind = 'inline' | 'block'
export type RichMarkdownSafeHtmlText = { type: 'text'; value: string }
export type RichMarkdownSafeHtmlElement = {
  type: 'element'
  tagName:
    | 'a'
    | 'span'
    | 'u'
    | 'mark'
    | 'sub'
    | 'sup'
    | 'kbd'
    | 'br'
    | 'p'
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
  attributes: Readonly<Record<string, string>>
  styles: Readonly<Record<string, string>>
  children: readonly RichMarkdownSafeHtmlNode[]
}
export type RichMarkdownSafeHtmlNode = RichMarkdownSafeHtmlText | RichMarkdownSafeHtmlElement
export type RichMarkdownSafeHtmlFragment = {
  kind: RichMarkdownSafeHtmlKind
  source: string
  root: RichMarkdownSafeHtmlElement
}
export type RichMarkdownSafeHtmlTag = RichMarkdownSafeHtmlElement['tagName']

export function isRichMarkdownSafeHtmlTag(value: string): value is RichMarkdownSafeHtmlTag {
  return (
    RICH_MARKDOWN_SAFE_HTML_INLINE_TAGS.has(value) || RICH_MARKDOWN_SAFE_HTML_BLOCK_TAGS.has(value)
  )
}
