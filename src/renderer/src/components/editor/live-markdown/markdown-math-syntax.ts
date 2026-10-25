import type { MarkdownConfig } from '@lezer/markdown'

export const markdownMathSyntax: MarkdownConfig = {
  defineNodes: ['InlineMath', { name: 'DisplayMath', block: true }],
  parseInline: [
    {
      name: 'InlineMath',
      before: 'Link',
      parse(context, next, position) {
        if (
          next !== 36 ||
          context.char(position + 1) === 36 ||
          context.char(position - 1) === 36 ||
          /\s/.test(context.slice(position + 1, position + 2))
        ) {
          return -1
        }
        if (
          /^\$[0-9][0-9,.]*(?:[\t ]+[A-Za-z]{2,}|[.;:][\t ])/.test(
            context.slice(position, context.end)
          )
        ) {
          return -1
        }
        for (let end = position + 2; end < context.end; end++) {
          const code = context.char(end)
          if (code === 10) {
            break
          }
          if (code === 92) {
            end++
            continue
          }
          if (
            code === 36 &&
            context.char(end + 1) !== 36 &&
            !/\s/.test(context.slice(end - 1, end)) &&
            !/[0-9]/.test(context.slice(end + 1, end + 2))
          ) {
            return context.addElement(context.elt('InlineMath', position, end + 1))
          }
        }
        return -1
      }
    }
  ],
  parseBlock: [
    {
      name: 'DisplayMath',
      before: 'FencedCode',
      parse(context, line) {
        if (line.indent >= line.baseIndent + 4 || !/^\$\$(?!\$)/.test(line.text.slice(line.pos))) {
          return false
        }
        const from = context.lineStart + line.pos
        let to = context.lineStart + line.text.length
        if (/^\$\$.+\$\$[\t ]*$/.test(line.text.slice(line.pos))) {
          context.nextLine()
        } else {
          while (context.nextLine()) {
            to = context.lineStart + line.text.length
            if (/^\s*\$\$[\t ]*$/.test(line.text)) {
              context.nextLine()
              break
            }
          }
        }
        context.addElement(context.elt('DisplayMath', from, to))
        return true
      },
      endLeaf(_context, line) {
        return line.indent < line.baseIndent + 4 && /^\$\$(?!\$)/.test(line.text.slice(line.pos))
      }
    }
  ]
}
