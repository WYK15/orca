import { createRoot, type Root } from 'react-dom/client'
import { useLayoutEffect, type ComponentProps, type JSX } from 'react'
import { WidgetType, type EditorView } from '@codemirror/view'
import { LiveMarkdownTable } from './LiveMarkdownTable'
import type { MarkdownTable } from './table-source'
import { revealTableSource } from './editor-context'
import type { TableCellRange } from './table-cell-selection'
import type { TableGridSelection } from './table-grid-selection'

type TableGeometry = { height: number }
const roots = new WeakMap<
  HTMLElement,
  { root: Root; observer: ResizeObserver; geometry: TableGeometry }
>()

function measureTable(dom: HTMLElement, view: EditorView): void {
  const mounted = roots.get(dom)
  if (!mounted || !dom.isConnected || !view.dom.isConnected) {
    return
  }
  const height = dom.getBoundingClientRect().height / view.scaleY
  if (height > 0) {
    mounted.geometry.height = height
  }
  view.requestMeasure()
}

function MeasuredTable({
  dom,
  ...props
}: ComponentProps<typeof LiveMarkdownTable> & { dom: HTMLElement }): JSX.Element {
  useLayoutEffect(() => {
    dom.style.minHeight = ''
    measureTable(dom, props.view)
  })
  return <LiveMarkdownTable {...props} />
}

export class MarkdownTableWidget extends WidgetType {
  constructor(
    readonly table: MarkdownTable,
    readonly raw: string,
    readonly canEdit: boolean,
    readonly mediaVersion = '',
    readonly selectedCell: TableCellRange | null = null,
    readonly selectionHead = 0,
    readonly selectionAnchor = 0,
    readonly grid: TableGridSelection | null = null,
    readonly geometry: TableGeometry = { height: -1 }
  ) {
    super()
  }
  get estimatedHeight(): number {
    return this.geometry.height
  }
  eq(other: MarkdownTableWidget): boolean {
    return (
      this.raw === other.raw &&
      this.table.from === other.table.from &&
      this.canEdit === other.canEdit &&
      this.mediaVersion === other.mediaVersion &&
      this.selectedCell?.from === other.selectedCell?.from &&
      this.selectedCell?.to === other.selectedCell?.to &&
      this.selectionHead === other.selectionHead &&
      this.selectionAnchor === other.selectionAnchor &&
      JSON.stringify(this.grid) === JSON.stringify(other.grid)
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    // React mounts asynchronously; keep the last height until its table is committed.
    if (this.geometry.height > 0) {
      dom.style.minHeight = `${this.geometry.height}px`
    }
    const root = createRoot(dom)
    const observer = new ResizeObserver(() => measureTable(dom, view))
    roots.set(dom, { root, observer, geometry: this.geometry })
    observer.observe(dom)
    this.render(root, view, dom)
    return dom
  }
  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const mounted = roots.get(dom)
    if (!mounted) {
      return false
    }
    mounted.geometry = this.geometry
    this.render(mounted.root, view, dom)
    return true
  }
  private render(root: Root, view: EditorView, dom: HTMLElement): void {
    root.render(
      <MeasuredTable
        dom={dom}
        table={this.table}
        view={view}
        readOnly={!this.canEdit}
        revealSource={() => {
          view.dispatch({
            effects: revealTableSource.of(this.table.from),
            selection: { anchor: this.table.from }
          })
          view.focus()
        }}
      />
    )
  }
  destroy(dom: HTMLElement): void {
    const mounted = roots.get(dom)
    roots.delete(dom)
    mounted?.observer.disconnect()
    queueMicrotask(() => mounted?.root.unmount())
  }
  ignoreEvent(): boolean {
    return true
  }
}
