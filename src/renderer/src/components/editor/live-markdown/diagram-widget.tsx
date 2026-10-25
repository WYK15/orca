import { createRoot, type Root } from 'react-dom/client'
import { WidgetType, type EditorView } from '@codemirror/view'
import MermaidBlock from '../MermaidBlock'

const roots = new WeakMap<HTMLElement, Root>()
export class MarkdownDiagramWidget extends WidgetType {
  readonly dark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  constructor(
    readonly source: string,
    readonly position: number
  ) {
    super()
  }
  eq(other: MarkdownDiagramWidget): boolean {
    return (
      this.source === other.source && this.position === other.position && this.dark === other.dark
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'live-md-diagram'
    const root = createRoot(dom)
    roots.set(dom, root)
    root.render(<MermaidBlock content={this.source} isDark={this.dark} />)
    const observer = new ResizeObserver(() => {
      if (view.dom.isConnected) {
        view.requestMeasure()
      }
    })
    observer.observe(dom)
    ;(dom as HTMLElement & { observer?: ResizeObserver }).observer = observer
    dom.addEventListener('click', () => {
      if (view.state.readOnly) {
        return
      }
      view.dispatch({ selection: { anchor: this.position }, scrollIntoView: true })
      view.focus()
    })
    return dom
  }
  destroy(dom: HTMLElement): void {
    ;(dom as HTMLElement & { observer?: ResizeObserver }).observer?.disconnect()
    const root = roots.get(dom)
    roots.delete(dom)
    queueMicrotask(() => root?.unmount())
  }
  ignoreEvent(): boolean {
    return true
  }
}
