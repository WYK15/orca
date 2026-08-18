export type MarkdownFenceRanges = readonly (readonly [number, number])[]

export function markdownFenceRanges(content: string): MarkdownFenceRanges {
  const ranges: [number, number][] = []
  let offset = 0
  let openFence: { closingPattern: RegExp; start: number } | null = null
  for (const lineMatch of content.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const line = lineMatch[0]
    if (line === '') {
      break
    }
    const lineText = line.replace(/(?:\r\n|\n|\r)$/u, '')
    if (openFence) {
      // Reuse the closer regex for every line of this fence.
      if (openFence.closingPattern.test(lineText)) {
        ranges.push([openFence.start, offset + line.length])
        openFence = null
      }
    } else {
      const openingFenceMatch = lineText.match(/^ {0,3}(`{3,}|~{3,})/u)
      if (openingFenceMatch?.[1]) {
        openFence = {
          closingPattern: new RegExp(
            `^ {0,3}${openingFenceMatch[1][0]}{${openingFenceMatch[1].length},}\\s*$`
          ),
          start: offset
        }
      }
    }
    offset += line.length
  }
  if (openFence) {
    ranges.push([openFence.start, content.length])
  }
  return ranges
}

export function isInsideMarkdownFence(index: number, ranges: MarkdownFenceRanges): boolean {
  return ranges.some(([start, end]) => index >= start && index < end)
}

export function transformOutsideMarkdownFences(
  content: string,
  transform: (segment: string) => string
): string {
  let result = ''
  let cursor = 0
  for (const [start, end] of markdownFenceRanges(content)) {
    result += transform(content.slice(cursor, start))
    result += content.slice(start, end)
    cursor = end
  }
  return result + transform(content.slice(cursor))
}

export function hasOnlySupportedDetailsBodyHtml(content: string): boolean {
  const fenceRanges = markdownFenceRanges(content)
  for (const match of content.matchAll(/<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?\/?>/g)) {
    if (isInsideMarkdownFence(match.index, fenceRanges)) {
      continue
    }
    if (/^<\/?p\s*>$/iu.test(match[0]) || /^<br\s*\/?>$/iu.test(match[0])) {
      continue
    }
    return false
  }
  return true
}
