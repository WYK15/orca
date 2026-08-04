import {
  containsRichMarkdownSafeHtmlControlCharacter,
  decodeRichMarkdownSafeHtmlCharacterReferences
} from './rich-markdown-safe-html-character-references'
import {
  validateRichMarkdownSafeHtmlAttributes,
  type RichMarkdownSafeHtmlParsedAttribute
} from './rich-markdown-safe-html-attributes'
import {
  isRichMarkdownSafeHtmlTag,
  RICH_MARKDOWN_SAFE_HTML_BLOCK_TAGS,
  RICH_MARKDOWN_SAFE_HTML_INLINE_TAGS,
  type RichMarkdownSafeHtmlElement,
  type RichMarkdownSafeHtmlFragment,
  type RichMarkdownSafeHtmlKind,
  type RichMarkdownSafeHtmlNode,
  type RichMarkdownSafeHtmlTag
} from './rich-markdown-safe-html-schema'

export type {
  RichMarkdownSafeHtmlElement,
  RichMarkdownSafeHtmlFragment,
  RichMarkdownSafeHtmlKind,
  RichMarkdownSafeHtmlNode,
  RichMarkdownSafeHtmlText
} from './rich-markdown-safe-html-schema'

export const SAFE_HTML_INLINE_BYTE_LIMIT = 16 * 1024
export const SAFE_HTML_BLOCK_BYTE_LIMIT = 64 * 1024
export const SAFE_HTML_NESTING_LIMIT = 8

const TAG_NAME_PATTERN = /[A-Za-z][A-Za-z0-9-]*/y
const ATTRIBUTE_NAME_PATTERN = /[A-Za-z_:][A-Za-z0-9_.:-]*/y
const HTML_WHITESPACE_PATTERN = /[\t\n\f\r ]/
const encoder = new TextEncoder()

export type RichMarkdownSafeHtmlParseStats = { transitions: number }

type ParsedOpeningTag = {
  tagName: RichMarkdownSafeHtmlTag
  attributes: Readonly<Record<string, string>>
  styles: Readonly<Record<string, string>>
  selfClosing: boolean
}

class HtmlCursor {
  index = 0

  constructor(
    readonly source: string,
    readonly stats?: RichMarkdownSafeHtmlParseStats
  ) {}

  advance(count = 1): void {
    this.index += count
    if (this.stats) {
      this.stats.transitions += count
    }
  }

  startsWith(value: string): boolean {
    return this.source.startsWith(value, this.index)
  }
}

export function parseRichMarkdownSafeHtml(
  source: string,
  expectedKind?: RichMarkdownSafeHtmlKind,
  stats?: RichMarkdownSafeHtmlParseStats
): RichMarkdownSafeHtmlFragment | null {
  return parseCandidate(source, expectedKind, stats, true)
}

export function matchRichMarkdownSafeHtml(
  content: string,
  start: number,
  kind: RichMarkdownSafeHtmlKind
): RichMarkdownSafeHtmlFragment | null {
  if (start < 0 || start >= content.length || (kind === 'block' && !isLineStart(content, start))) {
    return null
  }
  const parsed = parseCandidate(content.slice(start), kind, undefined, false)
  if (!parsed) {
    return null
  }
  return parsed
}

function parseCandidate(
  source: string,
  expectedKind: RichMarkdownSafeHtmlKind | undefined,
  stats: RichMarkdownSafeHtmlParseStats | undefined,
  requireEnd: boolean
): RichMarkdownSafeHtmlFragment | null {
  const cursor = new HtmlCursor(source, stats)
  const root = parseElement(cursor, 1, null)
  if (!root || (requireEnd && cursor.index !== source.length)) {
    return null
  }
  const kind = RICH_MARKDOWN_SAFE_HTML_BLOCK_TAGS.has(root.tagName) ? 'block' : 'inline'
  const matchedSource = source.slice(0, cursor.index)
  const byteLimit = kind === 'block' ? SAFE_HTML_BLOCK_BYTE_LIMIT : SAFE_HTML_INLINE_BYTE_LIMIT
  if (
    (expectedKind !== undefined && kind !== expectedKind) ||
    encoder.encode(matchedSource).byteLength > byteLimit ||
    (kind === 'inline' && /[\r\n]/.test(matchedSource)) ||
    containsRichMarkdownSafeHtmlControlCharacter(matchedSource)
  ) {
    return null
  }
  return { kind, source: matchedSource, root }
}

function parseElement(
  cursor: HtmlCursor,
  depth: number,
  parentTag: RichMarkdownSafeHtmlTag | null
): RichMarkdownSafeHtmlElement | null {
  if (depth > SAFE_HTML_NESTING_LIMIT) {
    return null
  }
  const opening = parseOpeningTag(cursor)
  if (!opening || (RICH_MARKDOWN_SAFE_HTML_BLOCK_TAGS.has(opening.tagName) && parentTag !== null)) {
    return null
  }
  if (opening.tagName === 'a' && parentTag === 'a') {
    return null
  }
  if (opening.tagName === 'br') {
    return opening.selfClosing ? createElement(opening, []) : createElement(opening, [])
  }
  if (opening.selfClosing) {
    return null
  }
  const children = parseChildren(cursor, opening.tagName, depth)
  if (!children || !parseClosingTag(cursor, opening.tagName)) {
    return null
  }
  return createElement(opening, children)
}

function createElement(
  opening: ParsedOpeningTag,
  children: readonly RichMarkdownSafeHtmlNode[]
): RichMarkdownSafeHtmlElement {
  return {
    type: 'element',
    tagName: opening.tagName,
    attributes: opening.attributes,
    styles: opening.styles,
    children
  }
}

function parseChildren(
  cursor: HtmlCursor,
  parentTag: RichMarkdownSafeHtmlTag,
  depth: number
): readonly RichMarkdownSafeHtmlNode[] | null {
  const children: RichMarkdownSafeHtmlNode[] = []
  while (cursor.index < cursor.source.length && !cursor.startsWith('</')) {
    if (cursor.startsWith('<')) {
      const child = parseElement(cursor, depth + 1, parentTag)
      if (!child || !RICH_MARKDOWN_SAFE_HTML_INLINE_TAGS.has(child.tagName)) {
        return null
      }
      children.push(child)
      continue
    }
    const textStart = cursor.index
    while (cursor.index < cursor.source.length && !cursor.startsWith('<')) {
      cursor.advance()
    }
    const decoded = decodeRichMarkdownSafeHtmlCharacterReferences(
      cursor.source.slice(textStart, cursor.index)
    )
    if (decoded === null) {
      return null
    }
    if (decoded) {
      children.push({ type: 'text', value: decoded })
    }
  }
  return children
}

function parseOpeningTag(cursor: HtmlCursor): ParsedOpeningTag | null {
  if (!cursor.startsWith('<') || cursor.startsWith('</') || cursor.startsWith('<!--')) {
    return null
  }
  cursor.advance()
  const nameMatch = matchAtCursor(cursor, TAG_NAME_PATTERN)
  if (!nameMatch) {
    return null
  }
  const tagName = nameMatch[0].toLowerCase()
  if (!isRichMarkdownSafeHtmlTag(tagName)) {
    return null
  }
  const parsedAttributes: RichMarkdownSafeHtmlParsedAttribute[] = []
  skipWhitespace(cursor)
  while (
    cursor.index < cursor.source.length &&
    !cursor.startsWith('>') &&
    !cursor.startsWith('/>')
  ) {
    const attribute = parseAttribute(cursor)
    if (!attribute) {
      return null
    }
    parsedAttributes.push(attribute)
    skipWhitespace(cursor)
  }
  const selfClosing = cursor.startsWith('/>')
  if (!selfClosing && !cursor.startsWith('>')) {
    return null
  }
  cursor.advance(selfClosing ? 2 : 1)
  if (tagName === 'br' ? parsedAttributes.length > 0 : selfClosing) {
    return null
  }
  const validated = validateRichMarkdownSafeHtmlAttributes(tagName, parsedAttributes)
  return validated ? { tagName, ...validated, selfClosing } : null
}

function parseAttribute(cursor: HtmlCursor): RichMarkdownSafeHtmlParsedAttribute | null {
  const nameMatch = matchAtCursor(cursor, ATTRIBUTE_NAME_PATTERN)
  if (!nameMatch) {
    return null
  }
  skipWhitespace(cursor)
  if (!cursor.startsWith('=')) {
    return null
  }
  cursor.advance()
  skipWhitespace(cursor)
  const quote = cursor.source[cursor.index]
  let rawValue = ''
  if (quote === '"' || quote === "'") {
    cursor.advance()
    const end = cursor.source.indexOf(quote, cursor.index)
    if (end === -1) {
      return null
    }
    rawValue = cursor.source.slice(cursor.index, end)
    cursor.advance(end - cursor.index + 1)
  } else {
    const start = cursor.index
    while (
      cursor.index < cursor.source.length &&
      !HTML_WHITESPACE_PATTERN.test(cursor.source[cursor.index]) &&
      cursor.source[cursor.index] !== '>' &&
      !cursor.startsWith('/>')
    ) {
      cursor.advance()
    }
    rawValue = cursor.source.slice(start, cursor.index)
  }
  if (!rawValue || /[<>]/.test(rawValue)) {
    return null
  }
  const value = decodeRichMarkdownSafeHtmlCharacterReferences(rawValue)
  return value === null ? null : { name: nameMatch[0].toLowerCase(), value }
}

function parseClosingTag(cursor: HtmlCursor, expectedTag: RichMarkdownSafeHtmlTag): boolean {
  if (!cursor.startsWith('</')) {
    return false
  }
  cursor.advance(2)
  const nameMatch = matchAtCursor(cursor, TAG_NAME_PATTERN)
  if (!nameMatch || nameMatch[0].toLowerCase() !== expectedTag) {
    return false
  }
  skipWhitespace(cursor)
  if (!cursor.startsWith('>')) {
    return false
  }
  cursor.advance()
  return true
}

function skipWhitespace(cursor: HtmlCursor): void {
  while (
    cursor.index < cursor.source.length &&
    HTML_WHITESPACE_PATTERN.test(cursor.source[cursor.index])
  ) {
    cursor.advance()
  }
}

function matchAtCursor(cursor: HtmlCursor, pattern: RegExp): RegExpExecArray | null {
  pattern.lastIndex = cursor.index
  const match = pattern.exec(cursor.source)
  if (match) {
    cursor.advance(match[0].length)
  }
  return match
}

function isLineStart(content: string, start: number): boolean {
  return start === 0 || content[start - 1] === '\n'
}
