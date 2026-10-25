import { WidgetType, type EditorView } from '@codemirror/view'
import DOMPurify from 'dompurify'
import { markdownEditorContext } from './editor-context'

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

export class MarkdownHtmlWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly mediaVersion = ''
  ) {
    super()
  }
  eq(other: MarkdownHtmlWidget): boolean {
    return (
      this.source === other.source &&
      this.from === other.from &&
      this.mediaVersion === other.mediaVersion
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'live-md-html'
    dom.append(
      DOMPurify.sanitize(this.source, {
        RETURN_DOM_FRAGMENT: true,
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
        FORBID_ATTR: ['style', 'id', 'class', 'contenteditable', 'tabindex']
      })
    )
    for (const image of dom.querySelectorAll('img')) {
      const path = image.getAttribute('src')
      image.removeAttribute('src')
      if (path) {
        void view.state
          .facet(markdownEditorContext)
          .loadImage(path)
          .then((src) => {
            if (src) {
              image.src = src
              if (view.dom.isConnected) {
                view.requestMeasure()
              }
            }
          })
          .catch(() => {})
      }
    }
    dom.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const link = target?.closest('a')
      if (link) {
        event.preventDefault()
        view.state.facet(markdownEditorContext).openLink(link.getAttribute('href') ?? '')
        return
      }
      if (target?.closest('summary') || view.state.readOnly) {
        return
      }
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true })
      view.focus()
    })
    return dom
  }
  ignoreEvent(): boolean {
    return true
  }
}

export class MarkdownMathWidget extends WidgetType {
  constructor(
    readonly formula: string,
    readonly display: boolean,
    readonly from: number
  ) {
    super()
  }
  eq(other: MarkdownMathWidget): boolean {
    return (
      this.formula === other.formula && this.display === other.display && this.from === other.from
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
        selection: { anchor: this.from + (this.display ? 3 : 1) },
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
