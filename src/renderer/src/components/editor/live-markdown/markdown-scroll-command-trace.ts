import type { EditorView } from '@codemirror/view'

export type ScrollTraceRecord = (event: string, detail?: Record<string, unknown>) => void
const stack = (): string =>
  new Error('Markdown scroll command').stack?.split('\n').slice(2, 10).join('\n').slice(0, 2400) ??
  ''

export function traceMarkdownScrollCommands(
  view: EditorView,
  record: ScrollTraceRecord
): () => void {
  const originalSetState = view.setState
  const originalDispatch = view.dispatch
  const originalFocus = view.contentDOM.focus
  const savedFocus = Object.getOwnPropertyDescriptor(view.contentDOM, 'focus')
  const savedTop = Object.getOwnPropertyDescriptor(view.scrollDOM, 'scrollTop')
  let prototype = Object.getPrototypeOf(view.scrollDOM)
  let top: PropertyDescriptor | undefined
  while (prototype && !top) {
    top = Object.getOwnPropertyDescriptor(prototype, 'scrollTop')
    prototype = Object.getPrototypeOf(prototype)
  }
  if (top?.get && top.set) {
    const { get, set } = top
    Object.defineProperty(view.scrollDOM, 'scrollTop', {
      configurable: true,
      get: () => get.call(view.scrollDOM),
      set: (value: number) => {
        record('scrollTop.write', { value, stack: stack() })
        set.call(view.scrollDOM, value)
        record('scrollTop.written')
      }
    })
  }
  view.contentDOM.focus = (options?: FocusOptions): void => {
    record('content.focus', { preventScroll: options?.preventScroll, stack: stack() })
    originalFocus.call(view.contentDOM, options)
  }
  view.setState = (state): void => {
    record('state.replace', {
      nextLength: state.doc.length,
      nextAnchor: state.selection.main.anchor,
      nextHead: state.selection.main.head,
      stack: stack()
    })
    originalSetState.call(view, state)
  }
  view.dispatch = (...transactions): void => {
    record('dispatch', { stack: stack() })
    originalDispatch(...transactions)
  }
  return () => {
    view.setState = originalSetState
    view.dispatch = originalDispatch
    if (savedFocus) {
      Object.defineProperty(view.contentDOM, 'focus', savedFocus)
    } else {
      Reflect.deleteProperty(view.contentDOM, 'focus')
    }
    if (savedTop) {
      Object.defineProperty(view.scrollDOM, 'scrollTop', savedTop)
    } else {
      Reflect.deleteProperty(view.scrollDOM, 'scrollTop')
    }
  }
}
