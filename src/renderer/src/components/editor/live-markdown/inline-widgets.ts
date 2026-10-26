import { WidgetType, type EditorView } from '@codemirror/view'

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
