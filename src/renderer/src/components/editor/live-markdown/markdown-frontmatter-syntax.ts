import type { MarkdownConfig } from '@lezer/markdown'

let activeFrontmatterEnd: number | null = null

export const markdownFrontmatterSyntax: MarkdownConfig = {
  defineNodes: [{ name: 'FrontMatter', block: true }],
  wrap(inner, input) {
    const opening = /^\ufeff?---/.test(input.read(0, Math.min(4, input.length)))
    const match = opening
      ? input
          .read(0, input.length)
          .match(/^\ufeff?---[\t ]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[\t ]*(?=\r?\n|$)/)
      : null
    const end = match?.[0].length ?? null
    return {
      get parsedPos() {
        return inner.parsedPos
      },
      get stoppedAt() {
        return inner.stoppedAt
      },
      stopAt(position) {
        inner.stopAt(position)
      },
      advance() {
        // Nested Markdown parses must restore the surrounding document's bounds.
        const previous = activeFrontmatterEnd
        activeFrontmatterEnd = end
        try {
          return inner.advance()
        } finally {
          activeFrontmatterEnd = previous
        }
      }
    }
  },
  parseBlock: [
    {
      name: 'FrontMatter',
      before: 'HorizontalRule',
      parse(context) {
        const end = activeFrontmatterEnd
        if (context.lineStart !== 0 || end === null) {
          return false
        }
        while (context.lineStart < end && context.nextLine()) {}
        context.addElement(context.elt('FrontMatter', 0, end))
        return true
      }
    }
  ]
}
