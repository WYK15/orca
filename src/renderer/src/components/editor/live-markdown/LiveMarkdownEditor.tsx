import React, { useLayoutEffect, useRef, useState } from 'react'
import { Compartment, EditorState, StateEffect, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { LiveMarkdownToolbar } from './LiveMarkdownToolbar'
import { markdownEditorExtensions } from './editor-extensions'
import {
  createSourceDocument,
  markdownSourceExtensions,
  markdownSourceField
} from './source-document'
import {
  markdownEditorContext,
  markdownEditorMode,
  type MarkdownEditorContext,
  type MarkdownEditorMode
} from './editor-context'
import { registerPendingEditorFlush } from '../editor-pending-flush'
import { scrollTopCache, setWithLRU } from '@/lib/scroll-cache'
import { cacheMarkdownEditorSession, readMarkdownEditorSession } from './editor-session-cache'
import {
  copyClipboardMarkdown,
  cutClipboardMarkdown,
  requestPlainMarkdownPaste,
  pasteClipboardMarkdown
} from './clipboard-markdown'
import { markdownLinkAt } from './markdown-links'
import { navigateMarkdownAnchor } from './markdown-document-navigation'
import { useMarkdownResourceEditor } from './use-markdown-resource-editor'
import { useMarkdownWritingPreferences } from './markdown-writing-preferences'
import {
  markdownWritingPreferences,
  markdownFocusPresentation,
  markdownTypewriterPresentation
} from './markdown-writing-presentation'
import { MarkdownWritingStatus } from './MarkdownWritingStatus'
import { MarkdownExportMenu } from './MarkdownExportMenu'
import '../../../assets/live-markdown-editor.css'

const refreshPresentation = StateEffect.define<null>()

export type LiveMarkdownEditorProps = {
  fileId: string
  content: string
  mode: MarkdownEditorMode
  readOnly?: boolean
  scrollCacheKey: string
  onChange: (source: string) => void
  onSave: (source: string) => void
  onReady?: (view: EditorView | null) => void
  onModeChange?: (mode: MarkdownEditorMode) => void
  context: MarkdownEditorContext
  pickImage?: () => void
  onPaste?: (event: ClipboardEvent, view: EditorView) => boolean
  onDrop?: (event: DragEvent, view: EditorView) => boolean
  fontZoom?: number
  documentTitle?: string
}

export default function LiveMarkdownEditor(props: LiveMarkdownEditorProps): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const current = useRef(props)
  const viewRef = useRef<EditorView | null>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const resourceEditor = useMarkdownResourceEditor(view)
  const preferences = useMarkdownWritingPreferences()
  const writing = useRef(new Compartment())
  const writingSettings = useRef(preferences)
  const resourceAction = useRef(resourceEditor.open)
  const presentation = useRef(new Compartment())
  const media = useRef(new Compartment())
  const openLink = (href: string): void => {
    if (!viewRef.current || !navigateMarkdownAnchor(viewRef.current, href)) {
      current.current.context.openLink(href)
    }
  }
  useLayoutEffect(() => {
    current.current = props
    resourceAction.current = resourceEditor.open
    writingSettings.current = preferences
  })

  const modeExtensions = (): ReturnType<Compartment['of']> => [
    markdownEditorMode.of(current.current.mode),
    EditorState.readOnly.of(
      current.current.readOnly === true || current.current.mode === 'preview'
    ),
    EditorView.editable.of(current.current.readOnly !== true && current.current.mode !== 'preview')
  ]

  const extensions = (raw: string): Extension => [
    markdownSourceExtensions(raw),
    markdownEditorExtensions(),
    presentation.current.of(modeExtensions()),
    media.current.of(
      markdownEditorContext.of({
        version: current.current.context.version,
        loadImage: current.current.context.loadImage,
        editResource: (position) => resourceAction.current(position),
        openLink
      })
    ),
    writing.current.of([
      markdownWritingPreferences.of(writingSettings.current),
      EditorView.contentAttributes.of({
        'aria-label': 'Markdown 文档',
        spellcheck: String(writingSettings.current.spellcheck)
      })
    ]),
    markdownFocusPresentation,
    markdownTypewriterPresentation,
    Prec.highest(
      keymap.of([
        {
          key: 'Mod-k',
          run: () => {
            resourceAction.current()
            return true
          }
        }
      ])
    ),
    keymap.of([
      {
        key: 'Mod-/',
        run: () => {
          current.current.onModeChange?.(current.current.mode === 'source' ? 'live' : 'source')
          return true
        }
      },
      {
        key: 'Mod-s',
        run: (editor) => {
          if (!editor.state.readOnly) {
            current.current.onSave(editor.state.field(markdownSourceField).raw)
          }
          return true
        }
      }
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        current.current.onChange(update.state.field(markdownSourceField).raw)
      }
    }),
    EditorView.domEventHandlers({
      keydown: (event, editor) => {
        const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
        if (modifier && event.shiftKey && event.key.toLowerCase() === 'v') {
          requestPlainMarkdownPaste(editor)
        }
        return false
      },
      paste: (event, editor) =>
        !editor.state.readOnly &&
        ((current.current.onPaste?.(event, editor) ?? false) ||
          pasteClipboardMarkdown(event, editor)),
      copy: copyClipboardMarkdown,
      cut: cutClipboardMarkdown,
      drop: (event, editor) =>
        !editor.state.readOnly && (current.current.onDrop?.(event, editor) ?? false),
      click: (event, editor) => {
        const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
        if (!modifier && current.current.mode !== 'preview') {
          return false
        }
        const position = editor.posAtCoords({ x: event.clientX, y: event.clientY })
        if (position === null) {
          return false
        }
        const link = markdownLinkAt(editor.state, position)
        if (link) {
          event.preventDefault()
          openLink(link.href)
          return true
        }
        return false
      }
    })
  ]
  const createState = (raw: string, anchor?: number): EditorState => {
    const document = createSourceDocument(raw)
    return EditorState.create({
      doc: document.text,
      selection: {
        anchor: Math.min(
          anchor ?? document.text.match(/^(?:\ufeff)?#{1,6}[ \t]+/)?.[0].length ?? 0,
          document.text.length
        )
      },
      extensions: extensions(raw)
    })
  }

  useLayoutEffect(() => {
    if (!container.current) {
      return
    }
    const mounted = current.current
    const cached = readMarkdownEditorSession(
      current.current.scrollCacheKey,
      current.current.content
    )
    const editor = new EditorView({
      state: cached?.state ?? createState(current.current.content),
      parent: container.current
    })
    if (cached) {
      editor.dispatch({ effects: StateEffect.reconfigure.of(extensions(current.current.content)) })
    }
    viewRef.current = editor
    editor.scrollDOM.classList.add('scrollbar-editor')
    const themeObserver = new MutationObserver(() =>
      editor.dispatch({ effects: refreshPresentation.of(null) })
    )
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    setView(editor)
    current.current.onReady?.(editor)
    editor.scrollDOM.scrollTop =
      cached?.scrollTop ?? scrollTopCache.get(current.current.scrollCacheKey) ?? 0
    const unregister = registerPendingEditorFlush(props.fileId, () => {
      const source = editor.state.field(markdownSourceField).raw
      if (source !== current.current.content) {
        current.current.onChange(source)
      }
    })
    return () => {
      unregister()
      themeObserver.disconnect()
      setWithLRU(scrollTopCache, mounted.scrollCacheKey, editor.scrollDOM.scrollTop)
      cacheMarkdownEditorSession(mounted.scrollCacheKey, editor.state, editor.scrollDOM.scrollTop)
      mounted.onReady?.(null)
      viewRef.current = null
      editor.destroy()
    }
  }, [props.fileId])

  useLayoutEffect(() => {
    viewRef.current?.dispatch({ effects: presentation.current.reconfigure(modeExtensions()) })
  }, [props.mode, props.readOnly])

  useLayoutEffect(() => {
    viewRef.current?.dispatch({
      effects: writing.current.reconfigure([
        markdownWritingPreferences.of(preferences),
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown 文档',
          spellcheck: String(preferences.spellcheck)
        })
      ])
    })
  }, [preferences])

  useLayoutEffect(() => {
    const context = current.current.context
    viewRef.current?.dispatch({
      effects: media.current.reconfigure(
        markdownEditorContext.of({
          version: props.context.version,
          loadImage: context.loadImage,
          editResource: (position) => resourceAction.current(position),
          openLink
        })
      )
    })
  }, [props.context.version])

  useLayoutEffect(() => {
    const editor = viewRef.current
    if (!editor || props.content === editor.state.field(markdownSourceField).raw) {
      return
    }
    const scroll = editor.scrollDOM.scrollTop
    editor.setState(createState(props.content, editor.state.selection.main.head))
    editor.scrollDOM.scrollTop = scroll
  }, [props.content])

  return (
    <div
      className="live-markdown-editor"
      data-mode={props.mode}
      data-focus={preferences.focus && props.mode === 'live' ? 'true' : undefined}
      data-typewriter={preferences.typewriter && props.mode === 'live' ? 'true' : undefined}
      data-width={preferences.width}
      style={{ '--editor-font-zoom-level': props.fontZoom ?? 0 } as React.CSSProperties}
    >
      {props.mode !== 'preview' && !props.readOnly && (
        <LiveMarkdownToolbar
          view={view}
          pickImage={props.pickImage}
          editLink={() => resourceEditor.open()}
        />
      )}
      <div className="live-md-host" ref={container} />
      <MarkdownWritingStatus view={view} preferences={preferences}>
        <MarkdownExportMenu view={view} title={props.documentTitle ?? 'Markdown'} />
      </MarkdownWritingStatus>
      {resourceEditor.dialog}
    </div>
  )
}
