import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { parser, GFM } from '@lezer/markdown'
import { Marked } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'
import { markdownDocumentSyntax } from './markdown-document-syntax'
import { buildMarkdownDocument } from './markdown-document-model'
import { safeMarkdownHtmlStyle } from './markdown-html-preview'
import { escapeImageAttribute } from './markdown-image-attributes'

const escape = escapeImageAttribute
const exportParser = parser.configure([GFM, markdownDocumentSyntax])
function authoredStyles(source: string): string {
  return source.replace(
    /(<[a-z][^>]*?)\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (_, tag: string, double: string, single: string) =>
      `${tag} style="${escape(safeMarkdownHtmlStyle(double ?? single))}"`
  )
}
function renderDocumentBody(state: EditorState): string {
  const tree = exportParser.parse(state.doc.toString())
  const model = buildMarkdownDocument(state, tree)
  const replacements: { from: number; to: number; insert: string }[] = []
  tree.iterate({
    enter(node) {
      let insert: string | undefined
      if (['FencedCode', 'CodeBlock', 'InlineCode'].includes(node.name)) {
        insert = state.sliceDoc(node.from, node.to)
      } else if (
        node.name === 'FrontMatter' ||
        node.name === 'FootnoteDefinition' ||
        node.name === 'CommentBlock' ||
        node.name === 'InlineHtmlComment'
      ) {
        insert = ''
      } else if (node.name === 'DocumentToc') {
        insert = `<nav class="markdown-toc"><ol>${model.headings.map((heading) => `<li style="margin-left:${(heading.level - 1) * 12}px"><a href="#${escape(heading.id)}">${escape(heading.title)}</a></li>`).join('')}</ol></nav>`
      } else if (node.name === 'FootnoteReference') {
        const note = model.references.get(node.from)
        if (note) {
          insert = `<sup id="orcaw-reference-${node.from}"><a href="#orcaw-note-${note.number}">${note.number}</a></sup>`
        }
      } else if (node.name === 'InlineMath' || node.name === 'DisplayMath') {
        const source = state.sliceDoc(node.from, node.to)
        const display = node.name === 'DisplayMath'
        const closed = !display || /^\$\$.+\$\$\s*$/.test(source) || /\n\s*\$\$\s*$/.test(source)
        if (closed) {
          const formula = display
            ? source
                .slice(2)
                .replace(/\$\$\s*$/, '')
                .trim()
            : source.slice(1, -1)
          insert = katex.renderToString(formula, {
            displayMode: display,
            throwOnError: false,
            trust: false,
            strict: 'ignore'
          })
        }
      }
      if (insert !== undefined) {
        replacements.push({ from: node.from, to: node.to, insert })
        return false
      }
      return !['FencedCode', 'CodeBlock', 'InlineCode', 'HTMLBlock', 'InlineHtml'].includes(
        node.name
      )
    }
  })
  let at = 0
  const chunks: string[] = []
  for (const change of replacements) {
    chunks.push(authoredStyles(state.sliceDoc(at, change.from)), change.insert)
    at = change.to
  }
  chunks.push(authoredStyles(state.sliceDoc(at)))
  let headingIndex = 0
  const parser = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const heading = model.headings[headingIndex++]
        return `<h${depth}${heading ? ` id="${escape(heading.id)}"` : ''}>${this.parser.parseInline(tokens)}</h${depth}>\n`
      }
    }
  })
  const html = parser.parse(chunks.join(''), { async: false })
  if (!model.notes.length) {
    return html
  }
  const notes = model.notes
    .map((note) => {
      const body = EditorState.create({
        doc: note.body,
        extensions: [markdown({ base: markdownLanguage, extensions: markdownDocumentSyntax })]
      })
      const links = note.references
        .map(
          (reference, index) =>
            `<a href="#orcaw-reference-${reference.from}" aria-label="返回引用 ${index + 1}">↩${note.references.length > 1 ? index + 1 : ''}</a>`
        )
        .join(' ')
      return `<li id="orcaw-note-${note.number}" value="${note.number}">${renderDocumentBody(body)} ${links}</li>`
    })
    .join('')
  return `${html}<section class="markdown-footnotes"><hr><ol>${notes}</ol></section>`
}

export function markdownExportMarkup(state: EditorState): string {
  return DOMPurify.sanitize(renderDocumentBody(state), {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['contenteditable', 'tabindex', 'srcset']
  })
}
