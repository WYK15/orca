import { createRoot, type Root } from 'react-dom/client'
import { WidgetType, type EditorView } from '@codemirror/view'
import MermaidBlock from '../MermaidBlock'

type DiagramGeometry = { height: number }
const rendered = new WeakMap<
  DiagramGeometry,
  { source: string; dark: boolean; svg: SVGSVGElement }
>()
const roots = new WeakMap<
  HTMLElement,
  { root?: Root; resize: ResizeObserver; content: MutationObserver }
>()
export class MarkdownDiagramWidget extends WidgetType {
  readonly dark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  constructor(
    readonly source: string,
    readonly position: number,
    readonly geometry: DiagramGeometry = { height: -1 }
  ) {
    super()
  }
  get estimatedHeight(): number {
    return this.geometry.height
  }
  eq(other: MarkdownDiagramWidget): boolean {
    return (
      this.source === other.source && this.position === other.position && this.dark === other.dark
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'live-md-diagram'
    // Keep the measured space until Mermaid finishes its asynchronous SVG render.
    if (this.geometry.height > 0) {
      dom.style.minHeight = `${this.geometry.height}px`
    }
    const cached = rendered.get(this.geometry)
    let root: Root | undefined
    if (cached?.source === this.source && cached.dark === this.dark && !cached.svg.isConnected) {
      const block = document.createElement('div')
      block.className = 'mermaid-block'
      // Move the detached SVG so its IDs remain unique across mounted diagrams.
      block.append(cached.svg)
      dom.append(block)
    } else {
      root = createRoot(dom)
    }
    const measure = (): void => {
      if (!view.dom.isConnected || !dom.isConnected) {
        return
      }
      if (dom.querySelector('.mermaid-block')?.firstElementChild) {
        dom.style.minHeight = ''
        const height = dom.getBoundingClientRect().height / view.scaleY
        if (height > 0) {
          this.geometry.height = height
        }
        const svg = dom.querySelector<SVGSVGElement>('.mermaid-block > svg')
        if (svg) {
          rendered.set(this.geometry, { source: this.source, dark: this.dark, svg })
        }
      }
      view.requestMeasure()
    }
    const resize = new ResizeObserver(measure)
    const content = new MutationObserver(measure)
    roots.set(dom, { root, resize, content })
    resize.observe(dom)
    content.observe(dom, { childList: true, subtree: true })
    root?.render(<MermaidBlock content={this.source} isDark={this.dark} />)
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
    const mounted = roots.get(dom)
    roots.delete(dom)
    mounted?.resize.disconnect()
    mounted?.content.disconnect()
    queueMicrotask(() => mounted?.root?.unmount())
  }
  ignoreEvent(): boolean {
    return true
  }
}
