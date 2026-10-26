import { useEffect, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Image } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@/components/ui/context-menu'
import { MarkdownReactWidget } from './markdown-react-widget'
import { markdownEditorContext } from './editor-context'
import { navigateMarkdownSource } from './markdown-document-navigation'

function ImageFigure({ view, widget }: { view: EditorView; widget: MarkdownImageWidget }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let disposed = false
    void view.state
      .facet(markdownEditorContext)
      .loadImage(widget.src)
      .then((src) => {
        if (!disposed) {
          setUrl(src)
          setFailed(!src)
        }
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true)
        }
      })
    return () => {
      disposed = true
    }
  }, [view, widget.src, widget.mediaVersion])
  const edit = (): void => view.state.facet(markdownEditorContext).editResource?.(widget.from)
  const content = (
    <span
      className="live-md-image"
      onClick={(event) => {
        if (
          widget.allowEditing &&
          !(event.target instanceof Element && event.target.closest('button'))
        ) {
          navigateMarkdownSource(view, widget.from + 2)
        }
      }}
    >
      <img
        src={url ?? undefined}
        alt={widget.alt}
        loading="lazy"
        hidden={failed}
        onError={() => setFailed(true)}
        onLoad={() => {
          if (view.dom.isConnected) {
            view.requestMeasure()
          }
        }}
      />
      <span className="live-md-image-caption">
        {failed ? `图片未找到：${widget.src}` : widget.alt || widget.src}
      </span>
      {widget.allowEditing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="live-md-image-edit"
              variant="secondary"
              size="icon-sm"
              aria-label="编辑图片"
              onClick={edit}
            >
              <Image className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>编辑图片</TooltipContent>
        </Tooltip>
      )}
    </span>
  )
  const figure = widget.allowEditing ? (
    <ContextMenu>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={edit}>编辑图片</ContextMenuItem>
        <ContextMenuItem onSelect={() => navigateMarkdownSource(view, widget.from + 2)}>
          编辑图片源码
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ) : (
    content
  )
  return <TooltipProvider>{figure}</TooltipProvider>
}

export class MarkdownImageWidget extends MarkdownReactWidget {
  protected readonly className = 'live-md-image-widget'
  protected readonly tagName = 'span' as const
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly from: number,
    readonly allowEditing: boolean,
    readonly mediaVersion = ''
  ) {
    super()
  }
  eq(other: MarkdownImageWidget): boolean {
    return (
      this.src === other.src &&
      this.alt === other.alt &&
      this.from === other.from &&
      this.allowEditing === other.allowEditing &&
      this.mediaVersion === other.mediaVersion
    )
  }
  protected render(view: EditorView) {
    return <ImageFigure view={view} widget={this} />
  }
}
