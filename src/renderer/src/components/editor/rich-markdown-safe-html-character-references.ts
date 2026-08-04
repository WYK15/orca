import { decodeNamedCharacterReference } from 'decode-named-character-reference'

const CHARACTER_REFERENCE_PATTERN = /&([#A-Za-z0-9]+);/y

export function decodeRichMarkdownSafeHtmlCharacterReferences(value: string): string | null {
  let result = ''
  let index = 0
  while (index < value.length) {
    if (value[index] !== '&') {
      result += value[index]
      index += 1
      continue
    }
    CHARACTER_REFERENCE_PATTERN.lastIndex = index
    const match = CHARACTER_REFERENCE_PATTERN.exec(value)
    if (!match) {
      result += '&'
      index += 1
      continue
    }
    const decoded = decodeCharacterReferenceBody(match[1])
    if (decoded === false || containsRichMarkdownSafeHtmlControlCharacter(decoded)) {
      return null
    }
    result += decoded
    index += match[0].length
  }
  return result
}

export function containsRichMarkdownSafeHtmlControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      codePoint <= 8 ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127
    ) {
      return true
    }
  }
  return false
}

function decodeCharacterReferenceBody(value: string): string | false {
  if (!value.startsWith('#')) {
    return decodeNamedCharacterReference(value)
  }
  const hexadecimal = value[1]?.toLowerCase() === 'x'
  const digits = value.slice(hexadecimal ? 2 : 1)
  if (!digits || !(hexadecimal ? /^[\da-f]+$/i : /^\d+$/).test(digits)) {
    return false
  }
  const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10)
  if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return false
  }
  return String.fromCodePoint(codePoint)
}
