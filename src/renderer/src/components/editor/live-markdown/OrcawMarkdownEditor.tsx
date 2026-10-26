import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { EditorView } from '@codemirror/view'
import { useAppStore } from '@/store'
import { toast } from 'sonner'
import LiveMarkdownEditor from './LiveMarkdownEditor'
import {
  type MarkdownFileOwner,
  markdownWorkspacePath,
  loadMarkdownFileImage,
  importMarkdownFileImages,
  saveMarkdownClipboardImage
} from './markdown-file-media'
import { anchorImageInsertion } from './image-insertion-anchors'
import { MarkdownTableOfContentsPanel } from '../MarkdownTableOfContentsPanel'
import { buildMarkdownTableOfContents, type MarkdownTocItem } from '../markdown-table-of-contents'
import { onImageCacheInvalidated } from '../useLocalImageSrc'
import type { MarkdownViewMode } from '@/store/slices/editor'
import { navigateMarkdownAnchor } from './markdown-document-navigation'
import { basename } from '@/lib/path'

type Props = MarkdownFileOwner & {
  fileId: string
  content: string
  viewMode: MarkdownViewMode
  readOnly?: boolean
  scrollCacheKey: string
  onContentChange: (source: string) => void
  onDirtyStateHint: (dirty: boolean) => void
  onSave: (source: string) => void
  showTableOfContents: boolean
  onCloseTableOfContents: () => void
  revealLine?: number
  revealColumn?: number
  initialAnchor?: string
}

export default function OrcawMarkdownEditor(props: Props): React.JSX.Element {
  const editorId = useId()
  const editor = useRef<EditorView | null>(null)
  const [instance, setInstance] = useState<EditorView | null>(null)
  const [imageGeneration, setImageGeneration] = useState(0)
  useEffect(() => onImageCacheInvalidated(() => setImageGeneration((value) => value + 1)), [])
  const current = useRef(props)
  useLayoutEffect(() => {
    current.current = props
  })
  const fontZoom = useAppStore((state) => state.editorFontZoomLevel)
  const outlineContent = useDeferredValue(props.content)
  const outline = useMemo(
    () => (props.showTableOfContents ? buildMarkdownTableOfContents(outlineContent) : []),
    [outlineContent, props.showTableOfContents]
  )
  const change = useCallback((source: string) => {
    current.current.onDirtyStateHint(true)
    current.current.onContentChange(source)
  }, [])
  const context = useMemo(() => {
    const owner = {
      filePath: props.filePath,
      worktreeId: props.worktreeId,
      runtimeEnvironmentId: props.runtimeEnvironmentId,
      externalSshTargetId: props.externalSshTargetId
    }
    return {
      version: [
        props.filePath,
        props.worktreeId,
        props.runtimeEnvironmentId,
        props.externalSshTargetId,
        imageGeneration
      ].join('\0'),
      loadImage: (path: string) => loadMarkdownFileImage(owner, path),
      openLink: (href: string) => {
        void useAppStore.getState().activateMarkdownLink(href, {
          sourceFilePath: owner.filePath,
          worktreeId: owner.worktreeId,
          worktreeRoot: markdownWorkspacePath(owner),
          runtimeEnvironmentId: owner.runtimeEnvironmentId
        })
      }
    }
  }, [
    props.filePath,
    props.worktreeId,
    props.runtimeEnvironmentId,
    props.externalSshTargetId,
    imageGeneration
  ])

  const importImages = useCallback(async (paths: string[]) => {
    const view = editor.current
    if (!view || view.state.readOnly) {
      return
    }
    const insertion = anchorImageInsertion(view)
    const owner = { ...current.current }
    try {
      insertion.insert(await importMarkdownFileImages(owner, paths))
    } catch (error) {
      insertion.cancel()
      toast.error(error instanceof Error ? error.message : '图片导入失败')
    }
  }, [])
  const pickImage = useCallback(async () => {
    const path = await window.api.shell.pickImage()
    if (path) {
      await importImages([path])
    }
  }, [importImages])

  useEffect(
    () =>
      window.api.ui.onFileDrop((drop) => {
        if (drop.target !== 'markdown' || drop.editorId !== editorId) {
          return
        }
        const images = drop.paths.filter((path) =>
          /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(path)
        )
        if (images.length) {
          void importImages(images)
        }
      }),
    [editorId, importImages]
  )

  const navigate = (id: string): void => {
    const find = (items: MarkdownTocItem[]): MarkdownTocItem | undefined => {
      for (const item of items) {
        if (item.id === id) {
          return item
        }
        const child = find(item.children)
        if (child) {
          return child
        }
      }
      return undefined
    }
    const item = find(outline)
    const view = editor.current
    if (!item || !view) {
      return
    }
    const anchor = view.state.doc.line(Math.min(item.line, view.state.doc.lines)).from
    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'start' })
    })
  }
  useEffect(() => {
    if (!instance) {
      return
    }
    const line = props.revealLine
    if (!line && props.initialAnchor) {
      navigateMarkdownAnchor(instance, `#${props.initialAnchor.replace(/^#/, '')}`)
      return
    }
    if (!line) {
      return
    }
    const target = instance.state.doc.line(Math.max(1, Math.min(line, instance.state.doc.lines)))
    const anchor = Math.min(target.to, target.from + Math.max(0, (props.revealColumn ?? 1) - 1))
    instance.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'start' })
    })
  }, [instance, props.revealLine, props.revealColumn, props.initialAnchor])
  return (
    <div
      className="rich-markdown-editor-layout"
      data-native-file-drop-target={
        props.readOnly || props.viewMode === 'preview' ? 'editor' : 'markdown'
      }
      data-native-file-drop-editor-id={editorId}
    >
      {props.showTableOfContents && (
        <MarkdownTableOfContentsPanel
          items={outline}
          onClose={props.onCloseTableOfContents}
          onNavigate={navigate}
        />
      )}
      <div className="min-w-0 min-h-0 flex-1">
        <LiveMarkdownEditor
          fileId={props.fileId}
          documentTitle={basename(props.filePath).replace(/\.[^.]+$/, '')}
          content={props.content}
          mode={props.viewMode === 'rich' ? 'live' : props.viewMode}
          readOnly={props.readOnly}
          scrollCacheKey={props.scrollCacheKey}
          onChange={change}
          onSave={props.onSave}
          context={context}
          onModeChange={(mode) =>
            useAppStore
              .getState()
              .setMarkdownViewMode(props.fileId, mode === 'live' ? 'rich' : mode)
          }
          fontZoom={fontZoom}
          pickImage={() => {
            void pickImage()
          }}
          onReady={(view) => {
            editor.current = view
            setInstance(view)
          }}
          onPaste={(event, view) => {
            if (
              !Array.from(event.clipboardData?.items ?? []).some((item) =>
                item.type.startsWith('image/')
              )
            ) {
              return false
            }
            event.preventDefault()
            const insertion = anchorImageInsertion(view)
            const owner = { ...current.current }
            void saveMarkdownClipboardImage(owner)
              .then(async (path) => {
                if (path) {
                  insertion.insert(await importMarkdownFileImages(owner, [path]))
                } else {
                  insertion.cancel()
                }
              })
              .catch((error) => {
                insertion.cancel()
                toast.error(String(error))
              })
            return true
          }}
        />
      </div>
    </div>
  )
}
