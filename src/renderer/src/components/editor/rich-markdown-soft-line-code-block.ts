import { Extension } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { getRichMarkdownSoftLine, isolateRichMarkdownSoftLine } from './rich-markdown-soft-line'

function convertSoftLineFence(view: EditorView, from: number, to: number): boolean {
  const { state } = view
  if (view.composing || from !== to || !(state.selection instanceof TextSelection)) {
    return false
  }
  const $from = state.doc.resolve(from)
  if ($from.parent.type.name !== 'paragraph') {
    return false
  }
  const line = getRichMarkdownSoftLine($from)
  const match = line.textBefore.match(/^```([a-z]+)?$/)
  const codeBlock = state.schema.nodes.codeBlock
  if (line.from === 0 || !match || !codeBlock) {
    return false
  }
  const tr = state.tr.delete($from.start() + line.from, to)
  if (!isolateRichMarkdownSoftLine(tr)) {
    return false
  }
  tr.setBlockType(tr.selection.from, tr.selection.to, codeBlock, { language: match[1] ?? null })
  view.dispatch(tr.scrollIntoView())
  return true
}

export const RichMarkdownSoftLineCodeBlock = Extension.create({
  name: 'richMarkdownSoftLineCodeBlock',
  priority: 120,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput: (view, from, to, text) =>
            text === ' ' && convertSoftLineFence(view, from, to),
          handleKeyDown: (view, event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.isComposing
            ) {
              return false
            }
            return convertSoftLineFence(view, view.state.selection.from, view.state.selection.to)
          }
        }
      })
    ]
  }
})
