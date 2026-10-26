import { useLayoutEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@/components/ui/context-menu'
import { MarkdownReactWidget } from './markdown-react-widget'
import { mountMarkdownHtmlPreview } from './markdown-html-preview'
import { markdownEditorContext } from './editor-context'
import { navigateMarkdownSource } from './markdown-document-navigation'

function HtmlFragment({ view, widget }: { view: EditorView; widget: MarkdownHtmlWidget }) {
  const host = useRef<HTMLElement>(null)
  const [image, setImage] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!host.current) {
      return
    }
    const node = host.current
    const dispose = mountMarkdownHtmlPreview(node, widget.source, view, widget.inline)
    return () => {
      dispose()
      node.replaceChildren()
    }
  }, [widget.source, widget.mediaVersion, widget.inline, widget.canEdit, view])
  const Tag = widget.inline ? 'span' : 'div'
  const content = (
    <Tag
      className={widget.inline ? 'live-md-html-inline' : 'live-md-html'}
      ref={(node) => {
        host.current = node
      }}
      onClick={(event) => {
        if (
          !view.state.readOnly &&
          !(event.target instanceof Element && event.target.closest('a,summary'))
        ) {
          navigateMarkdownSource(view, widget.from + (widget.inline ? 1 : 0))
        }
      }}
      onContextMenuCapture={(event) => {
        const target = event.target instanceof Element ? event.target.closest('img') : null
        const index =
          target && host.current
            ? Array.from(host.current.querySelectorAll('img')).indexOf(target)
            : -1
        const match = Array.from(widget.source.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi))[
          index
        ]
        setImage(match ? widget.from + match.index! : null)
      }}
    />
  )
  return widget.canEdit ? (
    <ContextMenu>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={image === null}
          onSelect={() => {
            if (image !== null) {
              view.state.facet(markdownEditorContext).editResource?.(image)
            }
          }}
        >
          编辑图片
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => navigateMarkdownSource(view, widget.from + (widget.inline ? 1 : 0))}
        >
          编辑 HTML 源码
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ) : (
    content
  )
}

export class MarkdownHtmlWidget extends MarkdownReactWidget {
  protected readonly className = 'live-md-html-widget'
  protected readonly tagName: 'div' | 'span'
  constructor(
    readonly source: string,
    readonly from: number,
    readonly mediaVersion = '',
    readonly inline = false,
    readonly canEdit = true
  ) {
    super()
    this.tagName = inline ? 'span' : 'div'
  }
  eq(other: MarkdownHtmlWidget): boolean {
    return (
      this.source === other.source &&
      this.from === other.from &&
      this.mediaVersion === other.mediaVersion &&
      this.inline === other.inline &&
      this.canEdit === other.canEdit
    )
  }
  protected render(view: EditorView) {
    return <HtmlFragment view={view} widget={this} />
  }
}
