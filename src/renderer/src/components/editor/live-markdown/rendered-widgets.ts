import { WidgetType, type EditorView } from '@codemirror/view'
import { mountMarkdownHtmlPreview } from './markdown-html-preview'

export class MarkdownEntityWidget extends WidgetType {
  constructor(readonly source: string) {
    super()
  }
  eq(other: MarkdownEntityWidget): boolean {
    return this.source === other.source
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    const text = document.createElement('textarea')
    text.innerHTML = this.source
    span.textContent = text.value
    return span
  }
}

const htmlDisposers = new WeakMap<HTMLElement, () => void>()
export class MarkdownHtmlWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly mediaVersion = '',
    readonly inline = false
  ) {
    super()
  }
  eq(other: MarkdownHtmlWidget): boolean {
    return (
      this.source === other.source &&
      this.from === other.from &&
      this.mediaVersion === other.mediaVersion &&
      this.inline === other.inline
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement(this.inline ? 'span' : 'div')
    dom.className = this.inline ? 'live-md-html-inline' : 'live-md-html'
    htmlDisposers.set(dom, mountMarkdownHtmlPreview(dom, this.source, view, this.inline))
    dom.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (view.state.readOnly || target?.closest('a,summary')) {
        return
      }
      view.dispatch({
        selection: { anchor: this.from + (this.inline ? 1 : 0) },
        scrollIntoView: true
      })
      view.focus()
    })
    return dom
  }
  destroy(dom: HTMLElement): void {
    htmlDisposers.get(dom)?.()
    htmlDisposers.delete(dom)
  }
  ignoreEvent(): boolean {
    return true
  }
}

export class MarkdownMathWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly display: boolean,
    readonly from: number,
    readonly contentFrom = from + (display ? 3 : 1)
  ) {
    super()
  }
  eq(other: MarkdownMathWidget): boolean {
    return (
      this.formula === other.formula &&
      this.display === other.display &&
      this.from === other.from &&
      this.contentFrom === other.contentFrom
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement(this.display ? 'div' : 'span')
    dom.className = 'live-md-math'
    dom.textContent = this.formula
    void import('katex')
      .then((katex) => {
        katex.default.render(this.formula, dom, {
          displayMode: this.display,
          throwOnError: false,
          trust: false,
          strict: 'ignore'
        })
        if (view.dom.isConnected) {
          view.requestMeasure()
        }
      })
      .catch(() => {})
    dom.addEventListener('click', () => {
      if (view.state.readOnly) {
        return
      }
      view.dispatch({
        selection: { anchor: this.contentFrom },
        scrollIntoView: true
      })
      view.focus()
    })
    return dom
  }
  ignoreEvent(): boolean {
    return true
  }
}
