import type { MarkdownConfig } from '@lezer/markdown'

const definitionStart = /^\[\^([^\]\s]+)\]:[\t ]*/

export const markdownFootnoteSyntax: MarkdownConfig = {
  defineNodes: [
    'FootnoteReference',
    { name: 'FootnoteDefinition', block: true },
    { name: 'DocumentToc', block: true }
  ],
  parseInline: [
    {
      name: 'FootnoteReference',
      before: 'Link',
      parse(context, next, position) {
        if (next !== 91 || context.char(position + 1) !== 94) {
          return -1
        }
        const match = context.slice(position, context.end).match(/^\[\^([^\]\s]+)\]/)
        return match
          ? context.addElement(
              context.elt('FootnoteReference', position, position + match[0].length)
            )
          : -1
      }
    }
  ],
  parseBlock: [
    {
      name: 'FootnoteDefinition',
      before: 'LinkReference',
      parse(context, line) {
        if (
          context.parentType().name !== 'Document' ||
          line.indent >= 4 ||
          !definitionStart.test(line.text.slice(line.pos))
        ) {
          return false
        }
        const from = context.lineStart + line.pos
        let to = context.lineStart + line.text.length
        while (context.nextLine()) {
          if (
            /^(?: {4}|\t)/.test(line.text) ||
            (!line.text.trim() && /^(?: {4}|\t)/.test(context.peekLine()))
          ) {
            to = context.lineStart + line.text.length
          } else {
            break
          }
        }
        context.addElement(context.elt('FootnoteDefinition', from, to))
        return true
      },
      endLeaf(context, line) {
        return (
          context.parentType().name === 'Document' &&
          line.indent < 4 &&
          definitionStart.test(line.text.slice(line.pos))
        )
      }
    },
    {
      name: 'DocumentToc',
      before: 'LinkReference',
      parse(context, line) {
        if (
          line.indent >= line.baseIndent + 4 ||
          !/^\[toc\][\t ]*$/i.test(line.text.slice(line.pos))
        ) {
          return false
        }
        const from = context.lineStart + line.pos
        const to = context.lineStart + line.text.trimEnd().length
        context.nextLine()
        context.addElement(context.elt('DocumentToc', from, to))
        return true
      },
      endLeaf(_context, line) {
        return (
          line.indent < line.baseIndent + 4 && /^\[toc\][\t ]*$/i.test(line.text.slice(line.pos))
        )
      }
    }
  ]
}
