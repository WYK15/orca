import { Node, type AnyExtension } from '@tiptap/core'
import {
  createRichMarkdownSafeHtmlDom,
  safeHtmlDomMatchesFragment
} from './rich-markdown-safe-html-dom'
import {
  parseRichMarkdownSafeHtml,
  type RichMarkdownSafeHtmlKind,
  type RichMarkdownSafeHtmlNode
} from './rich-markdown-safe-html-source'
import { createRichMarkdownSafeHtmlNodeView } from './rich-markdown-safe-html-node-view'
import {
  RICH_MARKDOWN_SAFE_HTML_BLOCK_NODE,
  RICH_MARKDOWN_SAFE_HTML_INLINE_NODE
} from './rich-markdown-safe-html-schema'
import type {
  RichMarkdownSourceKind,
  RichMarkdownSourceTransport
} from './rich-markdown-source-transport'

export { RICH_MARKDOWN_SAFE_HTML_BLOCK_NODE, RICH_MARKDOWN_SAFE_HTML_INLINE_NODE }

const CLIPBOARD_VERSION = '1'
const SOURCE_ATTRIBUTE = 'data-orca-safe-html-source'
const INLINE_MARKER = 'data-rich-markdown-safe-html-inline'
const BLOCK_MARKER = 'data-rich-markdown-safe-html-block'

export function createRichMarkdownSafeHtmlExtensions(
  transport: RichMarkdownSourceTransport
): AnyExtension[] {
  return [
    createSafeHtmlNode({
      name: RICH_MARKDOWN_SAFE_HTML_INLINE_NODE,
      kind: 'inline',
      marker: INLINE_MARKER,
      transport,
      transportKind: 'safe-inline-html'
    }),
    createSafeHtmlNode({
      name: RICH_MARKDOWN_SAFE_HTML_BLOCK_NODE,
      kind: 'block',
      marker: BLOCK_MARKER,
      transport,
      transportKind: 'safe-block-html'
    })
  ]
}

function createSafeHtmlNode({
  name,
  kind,
  marker,
  transport,
  transportKind
}: {
  name: string
  kind: RichMarkdownSafeHtmlKind
  marker: string
  transport: RichMarkdownSourceTransport
  transportKind: RichMarkdownSourceKind
}) {
  const inline = kind === 'inline'
  return Node.create({
    name,
    priority: 110,
    inline,
    group: inline ? 'inline' : 'block',
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        source: {
          default: '',
          rendered: false
        }
      }
    },

    markdownTokenName: name,
    markdownTokenizer: {
      name,
      level: kind,
      start: transport.startFor(transportKind),
      tokenize(source) {
        const matched = transport.match(source, transportKind)
        const parsed = matched && parseRichMarkdownSafeHtml(matched.value, kind)
        if (!matched || !parsed) {
          return undefined
        }
        return {
          type: name,
          raw: matched.raw,
          safeHtmlSource: parsed.source,
          block: !inline
        }
      }
    },
    parseMarkdown: (token, helpers) => {
      const source = (token as { safeHtmlSource?: unknown }).safeHtmlSource
      if (token.type !== name || typeof source !== 'string') {
        return []
      }
      return helpers.createNode(name, { source })
    },
    renderMarkdown: (node) => String(node.attrs?.source ?? ''),
    renderText: ({ node }) => {
      const parsed = parseRichMarkdownSafeHtml(String(node.attrs.source ?? ''), kind)
      return parsed ? safeHtmlText(parsed.root) : String(node.attrs.source ?? '')
    },

    addNodeView() {
      return createRichMarkdownSafeHtmlNodeView({
        kind,
        rawInlineNodeName: 'rawMarkdownHtmlInline',
        rawBlockNodeName: 'rawMarkdownHtmlBlock'
      })
    },

    parseHTML() {
      return [
        {
          tag: `[${marker}]`,
          getAttrs: (element: HTMLElement) => validateClipboardElement(element, kind, marker)
        }
      ]
    },

    renderHTML({ node }) {
      const source = String(node.attrs.source ?? '')
      const parsed = parseRichMarkdownSafeHtml(source, kind)
      if (!parsed) {
        const fallback = document.createElement(inline ? 'code' : 'pre')
        fallback.textContent = source
        return fallback
      }
      const element = createRichMarkdownSafeHtmlDom(parsed)
      element.setAttribute(marker, CLIPBOARD_VERSION)
      element.setAttribute(SOURCE_ATTRIBUTE, source)
      return element
    }
  })
}

function validateClipboardElement(
  element: HTMLElement,
  kind: RichMarkdownSafeHtmlKind,
  marker: string
): false | { source: string } {
  if (element.getAttribute(marker) !== CLIPBOARD_VERSION) {
    return false
  }
  const source = element.getAttribute(SOURCE_ATTRIBUTE)
  const parsed = source && parseRichMarkdownSafeHtml(source, kind)
  if (
    !parsed ||
    !safeHtmlDomMatchesFragment(element, parsed, [marker, SOURCE_ATTRIBUTE, 'data-pm-slice'])
  ) {
    return false
  }
  return { source: parsed.source }
}

function safeHtmlText(node: RichMarkdownSafeHtmlNode): string {
  if (node.type === 'text') {
    return node.value
  }
  if (node.tagName === 'br') {
    return '\n'
  }
  return node.children.map(safeHtmlText).join('')
}
