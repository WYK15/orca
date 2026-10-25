import { WidgetType, type EditorView } from '@codemirror/view'
import { markdownEditorContext } from './editor-context'

export class CodeLanguageWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly position: number
  ) {
    super()
  }
  eq(other: CodeLanguageWidget): boolean {
    return this.language === other.language && this.position === other.position
  }
  toDOM(view: EditorView): HTMLElement {
    const label = document.createElement('span')
    label.className = 'live-md-code-language'
    label.textContent = this.language || 'code'
    label.addEventListener('click', () => {
      if (view.state.readOnly) {
        return
      }
      view.dispatch({ selection: { anchor: this.position } })
      view.focus()
    })
    return label
  }
  ignoreEvent(): boolean {
    return true
  }
}

export class ListMarkerWidget extends WidgetType {
  constructor(readonly marker: string) {
    super()
  }
  eq(other: ListMarkerWidget): boolean {
    return this.marker === other.marker
  }
  toDOM(): HTMLElement {
    const marker = document.createElement('span')
    marker.className = 'live-md-list-marker'
    marker.textContent = /^\d/.test(this.marker) ? this.marker : '•'
    return marker
  }
}

export class TaskMarkerWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly checked: boolean,
    readonly readOnly: boolean
  ) {
    super()
  }
  eq(other: TaskMarkerWidget): boolean {
    return (
      this.from === other.from && this.checked === other.checked && this.readOnly === other.readOnly
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.disabled = this.readOnly
    box.setAttribute('aria-label', this.checked ? '标记任务未完成' : '标记任务完成')
    box.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.from + 1, to: this.from + 2, insert: box.checked ? 'x' : ' ' },
        userEvent: 'input'
      })
    })
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

export class MarkdownImageWidget extends WidgetType {
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
  toDOM(view: EditorView): HTMLElement {
    const figure = document.createElement('span')
    figure.className = 'live-md-image'
    figure.setAttribute('contenteditable', 'false')
    const image = document.createElement('img')
    image.alt = this.alt
    image.loading = 'lazy'
    const caption = document.createElement('span')
    caption.className = 'live-md-image-caption'
    caption.textContent = this.alt || this.src
    figure.append(image, caption)
    let disposed = false
    image.addEventListener('load', () => {
      if (view.dom.isConnected) {
        view.requestMeasure()
      }
    })
    image.addEventListener('error', () => {
      image.hidden = true
      caption.textContent = `图片未找到：${this.src}`
    })
    figure.addEventListener('click', (event) => {
      if (!this.allowEditing) {
        return
      }
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.from + 2 }, scrollIntoView: true })
      view.focus()
    })
    void view.state
      .facet(markdownEditorContext)
      .loadImage(this.src)
      .then((src) => {
        if (disposed) {
          return
        }
        if (src) {
          image.src = src
        } else {
          image.hidden = true
          caption.textContent = `图片未找到：${this.src}`
        }
      })
      .catch(() => {
        if (!disposed) {
          image.hidden = true
        }
      })
    ;(figure as HTMLElement & { dispose?: () => void }).dispose = () => {
      disposed = true
    }
    return figure
  }
  destroy(dom: HTMLElement): void {
    ;(dom as HTMLElement & { dispose?: () => void }).dispose?.()
  }
  ignoreEvent(): boolean {
    return true
  }
}
