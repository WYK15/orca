import type { MarkdownConfig } from '@lezer/markdown'

const inlineTags = new Set([
  'a',
  'abbr',
  'b',
  'big',
  'br',
  'code',
  'del',
  'em',
  'i',
  'img',
  'ins',
  'kbd',
  'mark',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
  'var'
])
const voidTags = new Set(['br', 'img'])

export const markdownInlineHtmlSyntax: MarkdownConfig = {
  defineNodes: ['InlineHtml', 'InlineHtmlComment'],
  parseInline: [
    {
      name: 'InlineHtml',
      before: 'HTMLTag',
      parse(context, next, position) {
        if (next !== 60) {
          return -1
        }
        const text = context.slice(position, context.end)
        if (text.startsWith('<!--')) {
          const end = text.indexOf('-->', 4)
          return end < 0
            ? -1
            : context.addElement(context.elt('InlineHtmlComment', position, position + end + 3))
        }
        const opening = text.match(/^<([a-z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/i)
        if (!opening || !inlineTags.has(opening[1].toLowerCase())) {
          return -1
        }
        const tag = opening[1].toLowerCase()
        if (voidTags.has(tag) || /\/\s*>$/.test(opening[0])) {
          return context.addElement(
            context.elt('InlineHtml', position, position + opening[0].length)
          )
        }
        let depth = 1
        const tokens = /<\/?([a-z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi
        tokens.lastIndex = opening[0].length
        for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
          if (token[1].toLowerCase() !== tag) {
            continue
          }
          depth += token[0].startsWith('</') ? -1 : /\/\s*>$/.test(token[0]) ? 0 : 1
          if (!depth) {
            return context.addElement(
              context.elt('InlineHtml', position, position + tokens.lastIndex)
            )
          }
        }
        return -1
      }
    }
  ]
}
