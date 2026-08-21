import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { translate } from '@/i18n/i18n'
import { createRichMarkdownSafeHtmlDom } from './rich-markdown-safe-html-dom'
import {
  RICH_MARKDOWN_SAFE_HTML_BLOCK_NODE,
  RICH_MARKDOWN_SAFE_HTML_INLINE_NODE
} from './rich-markdown-safe-html-schema'
import {
  parseRichMarkdownSafeHtml,
  type RichMarkdownSafeHtmlKind
} from './rich-markdown-safe-html-source'

export type RichMarkdownSafeHtmlNodeViewOptions = {
  kind: RichMarkdownSafeHtmlKind
  rawInlineNodeName: 'rawMarkdownHtmlInline'
  rawBlockNodeName: 'rawMarkdownHtmlBlock'
}

export function createRichMarkdownSafeHtmlNodeView(
  options: RichMarkdownSafeHtmlNodeViewOptions
): NodeViewRenderer {
  return ({ node: initialNode, view, getPos }) => {
    let currentNode = initialNode
    let activeControl: HTMLInputElement | HTMLTextAreaElement | null = null
    let draftDirty = false
    let composing = false
    let destroyed = false
    const inline = options.kind === 'inline'
    const dom = document.createElement(inline ? 'span' : 'div')
    dom.className = `rich-markdown-safe-html-node rich-markdown-safe-html-node--${options.kind}`
    dom.dataset.richMarkdownSafeHtmlNode = options.kind
    dom.setAttribute('contenteditable', 'false')

    const renderPreview = (): void => {
      activeControl = null
      draftDirty = false
      const source = String(currentNode.attrs.source ?? '')
      const parsed = parseRichMarkdownSafeHtml(source, options.kind)
      if (!parsed) {
        console.error('[rich-markdown-safe-html] Invalid safe HTML node source')
        const fallback = document.createElement('code')
        fallback.dataset.richMarkdownSafeHtmlError = ''
        fallback.textContent = source
        dom.replaceChildren(fallback)
        return
      }
      dom.replaceChildren(createRichMarkdownSafeHtmlDom(parsed))
    }

    const commitDraft = (control: HTMLInputElement | HTMLTextAreaElement): void => {
      if (destroyed || activeControl !== control) {
        return
      }
      activeControl = null
      const pos = getPos()
      if (typeof pos !== 'number') {
        return
      }
      const documentNode = view.state.doc.nodeAt(pos)
      if (
        !documentNode ||
        documentNode.type !== currentNode.type ||
        documentNode.attrs.source !== currentNode.attrs.source
      ) {
        return
      }
      const draft = control.value
      const parsed = parseRichMarkdownSafeHtml(draft)
      const replacementType = parsed
        ? view.state.schema.nodes[
            parsed.kind === 'inline'
              ? RICH_MARKDOWN_SAFE_HTML_INLINE_NODE
              : RICH_MARKDOWN_SAFE_HTML_BLOCK_NODE
          ]
        : view.state.schema.nodes[inline ? options.rawInlineNodeName : options.rawBlockNodeName]
      if (!replacementType) {
        return
      }
      const replacement = replacementType.create(parsed ? { source: draft } : { value: draft })
      const transaction = view.state.tr
      if (replacement.isInline === documentNode.isInline) {
        transaction.replaceWith(pos, pos + documentNode.nodeSize, replacement)
      } else {
        transaction.replaceRangeWith(pos, pos + documentNode.nodeSize, replacement)
      }
      view.dispatch(transaction)
    }

    const renderEditor = (): void => {
      const control = document.createElement(inline ? 'input' : 'textarea') as
        | HTMLInputElement
        | HTMLTextAreaElement
      if (control instanceof HTMLInputElement) {
        control.type = 'text'
      } else {
        control.rows = 4
      }
      control.className = 'rich-markdown-safe-html-source'
      control.setAttribute(
        'aria-label',
        translate('auto.components.editor.richMarkdownSafeHtml.sourceLabel', 'Edit HTML source')
      )
      control.value = String(currentNode.attrs.source ?? '')
      activeControl = control
      draftDirty = false
      control.addEventListener('input', () => {
        draftDirty = true
      })
      control.addEventListener('compositionstart', () => {
        composing = true
      })
      control.addEventListener('compositionend', () => {
        composing = false
      })
      control.addEventListener('keydown', (rawEvent) => {
        const event = rawEvent as KeyboardEvent
        if (composing || event.isComposing) {
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          renderPreview()
          return
        }
        if (event.key !== 'Enter') {
          return
        }
        if (!inline && event.shiftKey && control instanceof HTMLTextAreaElement) {
          event.preventDefault()
          control.setRangeText('\n', control.selectionStart, control.selectionEnd, 'end')
          draftDirty = true
          return
        }
        event.preventDefault()
        event.stopPropagation()
        commitDraft(control)
      })
      control.addEventListener('blur', () => {
        if (!composing) {
          commitDraft(control)
        }
      })
      dom.replaceChildren(control)
    }

    renderPreview()
    return {
      dom,
      selectNode: renderEditor,
      deselectNode: () => {
        if (activeControl) {
          renderPreview()
        }
      },
      update: (updatedNode: ProseMirrorNode) => {
        if (updatedNode.type !== currentNode.type) {
          return false
        }
        currentNode = updatedNode
        if (activeControl) {
          if (!draftDirty && !composing) {
            activeControl.value = String(updatedNode.attrs.source ?? '')
          }
        } else {
          renderPreview()
        }
        return true
      },
      stopEvent: (event) =>
        event.target instanceof HTMLElement &&
        (dom.contains(event.target) ||
          event.target.classList.contains('rich-markdown-safe-html-source')),
      ignoreMutation: () => true,
      destroy: () => {
        destroyed = true
        activeControl = null
      }
    }
  }
}
