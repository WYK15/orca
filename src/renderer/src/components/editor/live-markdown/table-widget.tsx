import { createRoot, type Root } from 'react-dom/client'
import { WidgetType, type EditorView } from '@codemirror/view'
import { LiveMarkdownTable } from './LiveMarkdownTable'
import type { MarkdownTable } from './table-source'
import { revealTableSource } from './editor-context'

const roots = new WeakMap<HTMLElement, Root>()

export class MarkdownTableWidget extends WidgetType {
  constructor(
    readonly table: MarkdownTable,
    readonly raw: string,
    readonly canEdit: boolean,
    readonly mediaVersion = ''
  ) {
    super()
  }
  eq(other: MarkdownTableWidget): boolean {
    return (
      this.raw === other.raw &&
      this.table.from === other.table.from &&
      this.canEdit === other.canEdit &&
      this.mediaVersion === other.mediaVersion
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    const root = createRoot(dom)
    roots.set(dom, root)
    this.render(root, view)
    return dom
  }
  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const root = roots.get(dom)
    if (!root) {
      return false
    }
    this.render(root, view)
    return true
  }
  private render(root: Root, view: EditorView): void {
    root.render(
      <LiveMarkdownTable
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
    requestAnimationFrame(() => {
      if (view.dom.isConnected) {
        view.requestMeasure()
      }
    })
  }
  destroy(dom: HTMLElement): void {
    const root = roots.get(dom)
    roots.delete(dom)
    queueMicrotask(() => root?.unmount())
  }
  ignoreEvent(): boolean {
    return true
  }
}
