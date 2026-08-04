// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { encodeRawMarkdownHtmlForRichEditor } from './raw-markdown-html'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'

type EditorFixture = {
  editor: Editor
  host: HTMLDivElement
  destroy: () => void
}

function createEditor(markdown: string): EditorFixture {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const codec = createRichMarkdownEditorCodec()
  const editor = new Editor({
    element: host,
    extensions: createRichMarkdownExtensions({ codec }),
    content: encodeRawMarkdownHtmlForRichEditor(markdown, codec),
    contentType: 'markdown'
  })
  return {
    editor,
    host,
    destroy: () => {
      editor.destroy()
      host.remove()
    }
  }
}

function findNodePosition(editor: Editor, nodeName: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.type.name === nodeName) {
      found = pos
    }
  })
  if (found === -1) {
    throw new Error(`Missing node: ${nodeName}`)
  }
  return found
}

function selectNode(editor: Editor, nodeName: string): void {
  const pos = findNodePosition(editor, nodeName)
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
}

function press(control: HTMLElement, key: string, options: KeyboardEventInit = {}): void {
  control.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, ...options }))
}

describe('rich Markdown safe HTML node view', () => {
  it('renders a safe preview until the inline atom is selected', () => {
    const fixture = createEditor('Before <span><u>safe</u></span> after')
    try {
      expect(
        fixture.host.querySelector('[data-rich-markdown-safe-html-node="inline"] u')?.textContent
      ).toBe('safe')
      expect(fixture.host.querySelector('input')).toBeNull()
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      expect(fixture.host.querySelector<HTMLInputElement>('input')?.value).toBe(
        '<span><u>safe</u></span>'
      )
    } finally {
      fixture.destroy()
    }
  })

  it('uses a textarea for selected block source', () => {
    const fixture = createEditor('<p>Alpha\n<span>Beta</span>\nGamma</p>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlBlock')
      expect(fixture.host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(
        '<p>Alpha\n<span>Beta</span>\nGamma</p>'
      )
    } finally {
      fixture.destroy()
    }
  })

  it('commits inline source with Enter', () => {
    const fixture = createEditor('<span>old</span>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const input = fixture.host.querySelector<HTMLInputElement>('input')!
      input.value = '<mark>new</mark>'
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      press(input, 'Enter')
      expect(fixture.editor.getMarkdown()).toBe('<mark>new</mark>')
    } finally {
      fixture.destroy()
    }
  })

  it('inserts a block newline with Shift+Enter and commits with Enter', () => {
    const fixture = createEditor('<p>old</p>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlBlock')
      const textarea = fixture.host.querySelector<HTMLTextAreaElement>('textarea')!
      textarea.setSelectionRange(6, 6)
      press(textarea, 'Enter', { shiftKey: true })
      expect(textarea.value).toBe('<p>old\n</p>')
      press(textarea, 'Enter')
      expect(fixture.editor.getMarkdown().trimEnd()).toBe('<p>old\n</p>')
    } finally {
      fixture.destroy()
    }
  })

  it('commits a draft on blur', () => {
    const fixture = createEditor('<span>old</span>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const input = fixture.host.querySelector<HTMLInputElement>('input')!
      input.value = '<u>blurred</u>'
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      input.dispatchEvent(new FocusEvent('blur'))
      expect(fixture.editor.getMarkdown()).toBe('<u>blurred</u>')
    } finally {
      fixture.destroy()
    }
  })

  it('cancels a draft with Escape', () => {
    const fixture = createEditor('<span>old</span>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const input = fixture.host.querySelector<HTMLInputElement>('input')!
      input.value = '<u>discarded</u>'
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      press(input, 'Escape')
      expect(fixture.editor.getMarkdown()).toBe('<span>old</span>')
      expect(fixture.host.querySelector('input')).toBeNull()
    } finally {
      fixture.destroy()
    }
  })

  it('does not commit or cancel during IME composition', () => {
    const fixture = createEditor('<span>old</span>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const input = fixture.host.querySelector<HTMLInputElement>('input')!
      input.value = '<mark>组合</mark>'
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      press(input, 'Enter')
      press(input, 'Escape')
      expect(fixture.editor.getMarkdown()).toBe('<span>old</span>')
      expect(fixture.host.querySelector('input')).toBe(input)
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      press(input, 'Enter')
      expect(fixture.editor.getMarkdown()).toBe('<mark>组合</mark>')
    } finally {
      fixture.destroy()
    }
  })

  it('falls back losslessly when an edited fragment is unsafe', () => {
    const fixture = createEditor('<span>old</span>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const input = fixture.host.querySelector<HTMLInputElement>('input')!
      input.value = '<span onclick="go()">unsafe</span>'
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      press(input, 'Enter')
      expect(fixture.editor.getMarkdown()).toBe('<span onclick="go()">unsafe</span>')
      expect(findNodePosition(fixture.editor, 'rawMarkdownHtmlInline')).toBeGreaterThan(0)
    } finally {
      fixture.destroy()
    }
  })

  it('preserves surrounding text when an inline edit becomes a block', () => {
    const fixture = createEditor('Before <span>old</span> after')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const input = fixture.host.querySelector<HTMLInputElement>('input')!
      input.value = '<p>block</p>'
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      press(input, 'Enter')
      const markdown = fixture.editor.getMarkdown()
      expect(markdown).toContain('Before')
      expect(markdown).toContain('<p>block</p>')
      expect(markdown).toContain('after')
      expect(findNodePosition(fixture.editor, 'richMarkdownSafeHtmlBlock')).toBeGreaterThan(0)
    } finally {
      fixture.destroy()
    }
  })

  it('adopts a programmatic source update when the draft is clean', () => {
    const fixture = createEditor('<span>old</span>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const pos = findNodePosition(fixture.editor, 'richMarkdownSafeHtmlInline')
      const transaction = fixture.editor.state.tr.setNodeMarkup(pos, undefined, {
        source: '<span>external</span>'
      })
      transaction.setSelection(NodeSelection.create(transaction.doc, pos))
      fixture.editor.view.dispatch(transaction)
      expect(fixture.host.querySelector<HTMLInputElement>('input')?.value).toBe(
        '<span>external</span>'
      )
    } finally {
      fixture.destroy()
    }
  })

  it('ignores a stale draft after the node is removed', () => {
    const fixture = createEditor('<span>old</span>')
    try {
      selectNode(fixture.editor, 'richMarkdownSafeHtmlInline')
      const input = fixture.host.querySelector<HTMLInputElement>('input')!
      const pos = findNodePosition(fixture.editor, 'richMarkdownSafeHtmlInline')
      fixture.editor.view.dispatch(fixture.editor.state.tr.delete(pos, pos + 1))
      input.value = '<mark>stale</mark>'
      expect(() => press(input, 'Enter')).not.toThrow()
      expect(fixture.editor.getMarkdown()).not.toContain('stale')
    } finally {
      fixture.destroy()
    }
  })

  it('reports invalid safe-node state and renders its source as text', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fixture = createEditor('<span>safe</span>')
    try {
      const pos = findNodePosition(fixture.editor, 'richMarkdownSafeHtmlInline')
      fixture.editor.view.dispatch(
        fixture.editor.state.tr.setNodeMarkup(pos, undefined, {
          source: '<span onclick="go()">invalid</span>'
        })
      )
      expect(fixture.host.querySelector('[data-rich-markdown-safe-html-error]')?.textContent).toBe(
        '<span onclick="go()">invalid</span>'
      )
      expect(error).toHaveBeenCalledOnce()
    } finally {
      fixture.destroy()
      error.mockRestore()
    }
  })
})
