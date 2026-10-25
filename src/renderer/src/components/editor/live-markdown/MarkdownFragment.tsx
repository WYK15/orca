import { useEffect, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import { markdownEditorContext } from './editor-context'
import { markdownLinkDefinitions } from './markdown-links'
import { navigateMarkdownAnchor } from './markdown-document-navigation'
import { safeMarkdownHtmlStyle } from './markdown-html-preview'

function FragmentImage({
  source,
  alt,
  view,
  ...attributes
}: {
  source: string
  alt: string
  view: EditorView
  width?: string | number
  height?: string | number
}) {
  const [url, setUrl] = useState<string>()
  const version = view.state.facet(markdownEditorContext).version
  useEffect(() => {
    let disposed = false
    void view.state
      .facet(markdownEditorContext)
      .loadImage(source)
      .then((next) => {
        if (!disposed) {
          setUrl(next ?? undefined)
        }
      })
      .catch(() => {
        if (!disposed) {
          setUrl(undefined)
        }
      })
    return () => {
      disposed = true
    }
  }, [source, version, view])
  return (
    <img
      {...attributes}
      src={url}
      alt={alt}
      loading="lazy"
      onLoad={() => {
        if (view.dom.isConnected) {
          view.requestMeasure()
        }
      }}
    />
  )
}

type HtmlNode = { properties?: Record<string, unknown>; children?: HtmlNode[] }
function filterAuthoredStyles() {
  return (root: HtmlNode): void => {
    const visit = (node: HtmlNode): void => {
      if (typeof node.properties?.style === 'string') {
        node.properties.style = safeMarkdownHtmlStyle(node.properties.style)
      }
      node.children?.forEach(visit)
    }
    visit(root)
  }
}

const fragmentSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'style']
  }
}

export function MarkdownFragment({ content, view }: { content: string; view: EditorView }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        filterAuthoredStyles,
        [rehypeSanitize, fragmentSchema],
        rehypeKatex
      ]}
      components={{
        img: ({ src, alt, width, height }) => (
          <FragmentImage
            source={typeof src === 'string' ? src : ''}
            alt={alt ?? ''}
            width={width}
            height={height}
            view={view}
          />
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault()
              const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
              if (view.state.readOnly || modifier) {
                event.stopPropagation()
                if (!navigateMarkdownAnchor(view, href ?? '')) {
                  view.state.facet(markdownEditorContext).openLink(href ?? '')
                }
              }
            }}
          >
            {children}
          </a>
        )
      }}
    >
      {`${content || '\u00a0'}\n\n${markdownLinkDefinitions(view.state)}`}
    </Markdown>
  )
}
