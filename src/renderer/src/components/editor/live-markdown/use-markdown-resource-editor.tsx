import { useState, useEffect } from 'react'
import type { EditorView } from '@codemirror/view'
import { MarkdownResourceDialog } from './MarkdownResourceDialog'
import { captureMarkdownCommandTarget, focusMarkdownInput } from './table-cell-command-target'
import {
  readMarkdownResource,
  newMarkdownLink,
  resourceEditTransaction,
  type MarkdownResource
} from './markdown-resource-source'
import { markdownCodeBlockAt } from './markdown-inline-format'

export function useMarkdownResourceEditor(view: EditorView | null) {
  const [editing, setEditing] = useState<{
    resource: MarkdownResource
    target: ReturnType<typeof captureMarkdownCommandTarget>
  } | null>(null)
  useEffect(() => () => setEditing(null), [view])
  const close = (): void => {
    setEditing(null)
    queueMicrotask(() => {
      if (view?.dom.isConnected && !view.state.readOnly) {
        focusMarkdownInput(view)
      }
    })
  }
  const open = (position?: number): void => {
    if (!view || view.state.readOnly) {
      return
    }
    const target = captureMarkdownCommandTarget(view, position !== undefined)
    if (markdownCodeBlockAt(target.state, position ?? target.state.selection.main.head)) {
      return
    }
    const resource =
      readMarkdownResource(target.state, position ?? target.state.selection.main.head) ??
      (position === undefined ? newMarkdownLink(target.state) : null)
    if (resource) {
      setEditing({ resource, target })
    }
  }
  return {
    open,
    dialog: editing && (
      <MarkdownResourceDialog
        resource={editing.resource}
        onClose={close}
        onApply={(draft) => {
          if (!editing.target.current()) {
            return false
          }
          const transaction = resourceEditTransaction(editing.target.state, editing.resource, draft)
          if (!transaction) {
            return false
          }
          editing.target.apply(editing.target.state.update(transaction))
          return true
        }}
      />
    )
  }
}
