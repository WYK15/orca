const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])
const RAW_TAG_START_PATTERN = /^<(\/?)([A-Za-z][\w.:-]*)/

export type RawMarkdownHtmlContainerStack = {
  readonly isInside: boolean
  observe: (rawTag: string) => void
}

export function createRawMarkdownHtmlContainerStack(): RawMarkdownHtmlContainerStack {
  const openTags: string[] = []
  return {
    get isInside() {
      return openTags.length > 0
    },
    observe: (rawTag) => {
      const match = rawTag.match(RAW_TAG_START_PATTERN)
      if (!match) {
        return
      }
      const closing = match[1] === '/'
      const tagName = match[2].toLowerCase()
      if (closing) {
        if (openTags.at(-1) === tagName) {
          openTags.pop()
        }
        return
      }
      if (!VOID_HTML_TAGS.has(tagName) && !/\/\s*>$/.test(rawTag)) {
        openTags.push(tagName)
      }
    }
  }
}

export function isEscapedMarkdownHtml(content: string, index: number): boolean {
  let backslashCount = 0
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) {
    backslashCount += 1
  }
  return backslashCount % 2 === 1
}

export function matchRawMarkdownHtmlBlock(content: string, start: number): string | null {
  const newlineIndex = content.indexOf('\n', start)
  const lineEnd = newlineIndex === -1 ? content.length : newlineIndex
  const line = content.slice(start, lineEnd)
  const trimmed = line.trim()
  if (!trimmed.startsWith('<')) {
    return null
  }
  if (trimmed.startsWith('<!--')) {
    return trimmed.includes('-->') ? line : null
  }
  return /^<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?\/?>$/.test(trimmed) ? line : null
}
