import { containsRichMarkdownSafeHtmlControlCharacter } from './rich-markdown-safe-html-character-references'
import { parseRichMarkdownSafeHtmlStyle } from './rich-markdown-safe-html-style'

export type RichMarkdownSafeHtmlParsedAttribute = { name: string; value: string }

export function validateRichMarkdownSafeHtmlAttributes(
  tagName: string,
  parsed: readonly RichMarkdownSafeHtmlParsedAttribute[]
): {
  attributes: Readonly<Record<string, string>>
  styles: Readonly<Record<string, string>>
} | null {
  const attributes: Record<string, string> = {}
  let styles: Readonly<Record<string, string>> = {}
  for (const attribute of parsed) {
    if (
      attribute.name in attributes ||
      (attribute.name === 'style' && Object.keys(styles).length)
    ) {
      return null
    }
    if (attribute.name === 'style') {
      styles = parseRichMarkdownSafeHtmlStyle(attribute.value) ?? {}
      if (!Object.keys(styles).length) {
        return null
      }
      continue
    }
    if (tagName !== 'a' || (attribute.name !== 'href' && attribute.name !== 'title')) {
      return null
    }
    if (attribute.name === 'href' && !validateSafeHtmlHref(attribute.value)) {
      return null
    }
    if (containsRichMarkdownSafeHtmlControlCharacter(attribute.value)) {
      return null
    }
    attributes[attribute.name] = attribute.value
  }
  return { attributes, styles }
}

function validateSafeHtmlHref(value: string): string | null {
  const classified = value.replace(/[\t\n\f\r ]/g, '')
  if (!classified) {
    return null
  }
  const scheme = classified.match(/^([A-Za-z][A-Za-z0-9+.-]*):/)
  if (!scheme) {
    return value
  }
  return /^(?:https?|mailto|file)$/i.test(scheme[1]) ? value : null
}
