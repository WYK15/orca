import { Extension, InputRule, markInputRule, nodeInputRule } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'

const boldStarInputRegex = /(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/
const boldUnderscoreInputRegex = /__(?!\s+__)([^_]+)__(?!\s+__)$/
const italicStarInputRegex = /(?<!\*)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/
const italicUnderscoreInputRegex = /(?<!_)_(?!\s+_)([^_]+)_(?!\s+_)$/
const strikeInputRegex = /(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))$/
const linkInputRegex = /(?<!!)\[([^\]]+)]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/
const imageInputRegex = /(!\[([^\]]*)]\((\S+)(?:\s+["']([^"']*)["'])?\))$/

export const RichMarkdownInlineInput = Extension.create({
  name: 'richMarkdownInlineInput',
  priority: 110,

  addInputRules() {
    const { bold, italic, strike, link } = this.editor.schema.marks
    const image = this.editor.schema.nodes.image
    return [
      markInputRule({ find: boldStarInputRegex, type: bold }),
      markInputRule({ find: boldUnderscoreInputRegex, type: bold }),
      markInputRule({ find: italicStarInputRegex, type: italic }),
      markInputRule({ find: italicUnderscoreInputRegex, type: italic }),
      markInputRule({ find: strikeInputRegex, type: strike }),
      new InputRule({
        find: linkInputRegex,
        handler: ({ state, range, match }) => {
          const [, label, href, title] = match
          state.tr.replaceWith(
            range.from,
            range.to,
            state.schema.text(label, [link.create({ href, title: title || null })])
          )
        }
      }),
      nodeInputRule({
        find: imageInputRegex,
        type: image,
        getAttributes: (match) => {
          const [, , alt, src, title] = match
          return { src, alt, title: title || null }
        }
      })
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput: (view, from, to, text) => {
            if (from !== to) {
              return false
            }
            const code = view.state.schema.marks.code
            const $from = view.state.doc.resolve(from)
            const activeMarks = view.state.storedMarks ?? $from.marks()
            if (text === '`' && activeMarks.some((mark) => mark.type === code)) {
              view.dispatch(
                view.state.tr.setStoredMarks(activeMarks.filter((mark) => mark.type !== code))
              )
              return true
            }
            if (text === '`') {
              return false
            }
            const beforeCursor = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0')
            const afterCursor = $from.parent.textBetween(
              $from.parentOffset,
              $from.parent.content.size,
              '\0',
              '\0'
            )
            const isBetweenPair =
              beforeCursor.endsWith('`') &&
              !beforeCursor.endsWith('``') &&
              afterCursor.startsWith('`') &&
              !afterCursor.startsWith('``')
            const followsEmptyPair = beforeCursor.endsWith('``') && !beforeCursor.endsWith('```')
            if (!isBetweenPair && !followsEmptyPair) {
              return false
            }
            const start = from - (isBetweenPair ? 1 : 2)
            const end = to + (isBetweenPair ? 1 : 0)
            const mark = code.create()
            const tr = view.state.tr.replaceWith(start, end, view.state.schema.text(text, [mark]))
            tr.setSelection(TextSelection.create(tr.doc, start + text.length))
            tr.setStoredMarks([mark])
            view.dispatch(tr)
            return true
          }
        }
      })
    ]
  }
})
