import { useEffect, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { markdownEditorContext } from './editor-context'

function CellImage({ source, alt, view }: { source: string; alt: string; view: EditorView }) {
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

export function TableCellMarkdown({ content, view }: { content: string; view: EditorView }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      components={{
        img: ({ src, alt }) => (
          <CellImage source={typeof src === 'string' ? src : ''} alt={alt ?? ''} view={view} />
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault()
              const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
              if (view.state.readOnly || modifier) {
                event.stopPropagation()
                view.state.facet(markdownEditorContext).openLink(href ?? '')
              }
            }}
          >
            {children}
          </a>
        )
      }}
    >
      {content || '\u00a0'}
    </Markdown>
  )
}
