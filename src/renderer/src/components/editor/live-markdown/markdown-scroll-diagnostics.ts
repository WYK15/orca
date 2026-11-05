import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view'
import { markdownEditorMode } from './editor-context'
import { liveMarkdownDecorations } from './live-decorations'
import { traceMarkdownScrollCommands } from './markdown-scroll-command-trace'

function elementLabel(target: EventTarget | null): string {
  const element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  return element ? `${element.tagName}.${element.getAttribute('class') ?? ''}`.slice(0, 160) : ''
}

function scrollEffect(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || !('range' in value) || !('y' in value)) {
    return null
  }
  const { range, y } = value
  if (
    typeof y !== 'string' ||
    !['nearest', 'start', 'center', 'end'].includes(y) ||
    !range ||
    typeof range !== 'object' ||
    !('from' in range) ||
    !('to' in range) ||
    typeof range.from !== 'number' ||
    typeof range.to !== 'number'
  ) {
    return null
  }
  return { from: range.from, to: range.to, y }
}

class MarkdownScrollDiagnostics {
  private entries: Record<string, unknown>[] = []
  private timer = 0
  private cleanups: (() => void)[] = []
  private sink?: (trace: string) => Promise<void>
  private readonly id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  private lastTop = 0
  private lastWheel = 0
  private lastDelta = 0
  private failures = 0

  constructor(private readonly view: EditorView) {
    if (!Reflect.has(window, '__TAURI_INTERNALS__')) {
      return
    }
    this.sink = window.api?.diagnostics?.recordMarkdownScrollTrace
    if (!this.sink) {
      return
    }
    this.cleanups.push(traceMarkdownScrollCommands(view, this.record))
    this.listen(view.scrollDOM, 'wheel', (event) => {
      const wheel = event as WheelEvent
      this.lastWheel = performance.now()
      this.lastDelta = wheel.deltaY
      this.record('wheel', {
        deltaY: wheel.deltaY,
        deltaX: wheel.deltaX,
        deltaMode: wheel.deltaMode,
        trusted: wheel.isTrusted,
        target: elementLabel(wheel.target),
        buttons: wheel.buttons
      })
    })
    this.listen(window, 'scroll', (event) => {
      const target = event.target
      if (
        target !== document &&
        target !== view.scrollDOM &&
        !(target instanceof Element && target.contains(view.dom))
      ) {
        return
      }
      const top = view.scrollDOM.scrollTop
      const backwards =
        top < this.lastTop - 80 && this.lastDelta > 0 && performance.now() - this.lastWheel < 500
      this.record(backwards ? 'backward-scroll' : 'scroll', {
        target: elementLabel(target),
        previousTop: this.lastTop,
        lastWheelAgo: performance.now() - this.lastWheel,
        lastDelta: this.lastDelta
      })
      this.lastTop = top
      if (backwards) {
        this.flush()
      }
    })
    for (const name of ['focus', 'blur', 'focusin', 'focusout']) {
      this.listen(window, name, (event) =>
        this.record(name, { target: elementLabel(event.target) })
      )
    }
    this.listen(document, 'selectionchange', () => {
      const selected = document.getSelection()
      if (!selected || !view.dom.contains(selected.anchorNode)) {
        return
      }
      this.record('native-selection', {
        anchor: elementLabel(selected.anchorNode),
        anchorOffset: selected.anchorOffset,
        focus: elementLabel(selected.focusNode),
        focusOffset: selected.focusOffset
      })
    })
    const mutation = new MutationObserver((records) =>
      this.record('content.mutation', {
        added: records.reduce((total, change) => total + change.addedNodes.length, 0),
        removed: records.reduce((total, change) => total + change.removedNodes.length, 0),
        diagrams: view.contentDOM.querySelectorAll('.live-md-diagram').length,
        svgs: view.contentDOM.querySelectorAll('.live-md-diagram svg').length,
        tables: view.contentDOM.querySelectorAll('.live-md-table').length
      })
    )
    mutation.observe(view.contentDOM, { childList: true, subtree: true })
    const resize = new ResizeObserver(() => this.record('content.resize'))
    resize.observe(view.contentDOM)
    this.cleanups.push(() => {
      mutation.disconnect()
      resize.disconnect()
    })
    const layout = view.dom.closest('.live-markdown-layout')
    this.record('mount', {
      agent: navigator.userAgent,
      layoutContainerType: layout ? getComputedStyle(layout).containerType : null
    })
  }

  private listen(target: EventTarget, event: string, callback: EventListener): void {
    target.addEventListener(event, callback, { capture: true, passive: true })
    this.cleanups.push(() => target.removeEventListener(event, callback, true))
  }

  private record = (event: string, detail?: Record<string, unknown>): void => {
    if (!this.sink || this.failures >= 3) {
      return
    }
    const view = this.view,
      selection = view.state.selection.main
    this.entries.push({
      at: performance.now(),
      event,
      detail,
      top: view.scrollDOM.scrollTop,
      left: view.scrollDOM.scrollLeft,
      height: view.scrollDOM.scrollHeight,
      clientHeight: view.scrollDOM.clientHeight,
      width: view.scrollDOM.clientWidth,
      contentHeight: view.contentHeight,
      viewport: view.viewport,
      mode: view.state.facet(markdownEditorMode),
      length: view.state.doc.length,
      lines: view.state.doc.lines,
      anchor: selection.anchor,
      head: selection.head,
      active: elementLabel(document.activeElement),
      focused: document.hasFocus(),
      connected: view.dom.isConnected,
      pageTop: window.scrollY
    })
    if (this.entries.length >= 200) {
      this.flush()
    } else if (!this.timer) {
      this.timer = window.setTimeout(() => this.flush(), 350)
    }
  }

  private flush(): void {
    clearTimeout(this.timer)
    this.timer = 0
    if (!this.entries.length || !this.sink) {
      return
    }
    const trace = JSON.stringify({
      schema: 1,
      build: 'markdown-scroll-trace-20261105-2',
      view: this.id,
      date: new Date().toISOString(),
      entries: this.entries.splice(0)
    })
    try {
      void this.sink(trace).catch(() => {
        this.failures++
      })
    } catch {
      this.failures++
    }
  }

  update(update: ViewUpdate): void {
    if (!this.sink) {
      return
    }
    this.record('update', {
      docChanged: update.docChanged,
      selectionSet: update.selectionSet,
      focusChanged: update.focusChanged,
      viewportChanged: update.viewportChanged,
      geometryChanged: update.geometryChanged,
      heightChanged: update.heightChanged,
      transactions: update.transactions.map((transaction) => ({
        scrollIntoView: transaction.scrollIntoView,
        effects: transaction.effects.length,
        scrollEffects: transaction.effects
          .map((effect) => scrollEffect(effect.value))
          .filter(Boolean),
        selection: !!transaction.selection
      }))
    })
    if (update.heightChanged || update.viewportChanged) {
      const widgets: Record<string, unknown>[] = []
      update.state
        .field(liveMarkdownDecorations)
        .between(0, update.state.doc.length, (from, to, decoration) => {
          const widget = decoration.spec.widget
          if (widget?.geometry) {
            widgets.push({
              from,
              to,
              kind: 'raw' in widget ? 'table' : 'diagram',
              height: widget.geometry.height
            })
          }
        })
      this.record('widgets', { widgets: widgets.slice(0, 30) })
    }
  }

  destroy(): void {
    this.record('dispose')
    this.cleanups.forEach((cleanup) => cleanup())
    this.flush()
  }
}

export const markdownScrollDiagnostics = ViewPlugin.fromClass(MarkdownScrollDiagnostics)
