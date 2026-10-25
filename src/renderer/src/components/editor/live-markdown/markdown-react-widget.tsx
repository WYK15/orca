import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { WidgetType, type EditorView } from '@codemirror/view'

const mounted = new WeakMap<HTMLElement, { root: Root; observer: ResizeObserver }>()

export abstract class MarkdownReactWidget extends WidgetType {
  protected abstract readonly className: string
  protected readonly tagName: 'div' | 'span' = 'div'
  protected abstract render(view: EditorView): ReactNode

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement(this.tagName)
    dom.className = this.className
    dom.contentEditable = 'false'
    const root = createRoot(dom)
    const observer = new ResizeObserver(() => {
      if (view.dom.isConnected) {
        view.requestMeasure()
      }
    })
    observer.observe(dom)
    mounted.set(dom, { root, observer })
    root.render(this.render(view))
    return dom
  }
  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const current = mounted.get(dom)
    if (!current) {
      return false
    }
    current.root.render(this.render(view))
    return true
  }
  destroy(dom: HTMLElement): void {
    const current = mounted.get(dom)
    mounted.delete(dom)
    current?.observer.disconnect()
    queueMicrotask(() => current?.root.unmount())
  }
  ignoreEvent(): boolean {
    return true
  }
}
