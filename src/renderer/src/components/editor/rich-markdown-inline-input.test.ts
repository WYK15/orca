// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'

function createEditor(content = ''): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
    content,
    contentType: 'markdown'
  })
}

function moveCursorToEnd(editor: Editor): void {
  editor.commands.setTextSelection(editor.state.doc.content.size - 1)
}

function typeText(editor: Editor, text: string): void {
  for (const character of text) {
    const { from, to } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, character, () =>
        editor.state.tr.insertText(character, from, to)
      )
    )
    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(character, from, to))
    }
  }
}

function expectTextMark(editor: Editor, text: string, markName: string): void {
  let found = false
  editor.state.doc.descendants((node) => {
    if (
      node.isText &&
      node.text === text &&
      node.marks.some((mark) => mark.type.name === markName)
    ) {
      found = true
    }
  })
  expect(found).toBe(true)
}

describe('rich Markdown inline input', () => {
  it.each(['前文`代码`', '前文`代码`后文'])(
    'exits inline code with ArrowRight at its end without changing text: %s',
    (source) => {
      const editor = createEditor(source)
      editor.commands.setTextSelection(5)
      const before = editor.getMarkdown()
      const handled = editor.view.someProp('handleKeyDown', (handler) =>
        handler(editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      )

      expect(handled).toBe(true)
      expect(editor.getMarkdown()).toBe(before)
      expect(editor.state.selection.from).toBe(5)
      expect(editor.isActive('code')).toBe(false)
      const handledAgain = editor.view.someProp('handleKeyDown', (handler) =>
        handler(editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      )
      expect(handledAgain).not.toBe(true)
      expect(editor.getMarkdown()).toBe(before)
      typeText(editor, '普通文本')
      expect(editor.getMarkdown()).toBe(source.replace('`代码`', '`代码`普通文本'))
      editor.destroy()
    }
  )

  it.each([
    { position: 4, event: {} },
    { position: { from: 3, to: 5 }, event: {} },
    { position: 5, event: { shiftKey: true } },
    { position: 5, event: { ctrlKey: true } },
    { position: 5, event: { metaKey: true } },
    { position: 5, event: { altKey: true } },
    { position: 5, event: { isComposing: true } }
  ])('preserves native navigation for $position / $event', ({ position, event }) => {
    const editor = createEditor('前文`代码`后文')
    editor.commands.setTextSelection(position)
    const before = editor.state
    const handled = editor.view.someProp('handleKeyDown', (handler) =>
      handler(editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight', ...event }))
    )

    expect(handled).not.toBe(true)
    expect(editor.state).toBe(before)
    editor.destroy()
  })

  it('preserves the link when exiting a code-styled link label', () => {
    const editor = createEditor('[`代码`](./guide.md)')
    editor.commands.setTextSelection(3)
    editor.view.someProp('handleKeyDown', (handler) =>
      handler(editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    )

    expect(editor.isActive('code')).toBe(false)
    expect(editor.isActive('link')).toBe(true)
    expect(editor.getMarkdown()).toBe('[`代码`](./guide.md)')
    editor.destroy()
  })

  it.each([
    { source: '前文**重点', closing: '**', mark: 'bold' },
    { source: '前文__重点', closing: '__', mark: 'bold' },
    { source: '前文*重点', closing: '*', mark: 'italic' },
    { source: '前文_重点', closing: '_', mark: 'italic' },
    { source: '前文~~重点', closing: '~~', mark: 'strike' }
  ])(
    'renders CJK-adjacent $mark syntax as the closing delimiter is typed',
    ({ source, closing, mark }) => {
      const editor = createEditor(source)
      moveCursorToEnd(editor)

      typeText(editor, closing)

      expectTextMark(editor, '重点', mark)
      expect(editor.getText()).toBe('前文重点')
      editor.destroy()
    }
  )

  it('enters inline code after an empty backtick pair is typed', () => {
    const editor = createEditor('前文')
    moveCursorToEnd(editor)

    typeText(editor, '``代码`')

    expectTextMark(editor, '代码', 'code')
    expect(editor.getMarkdown()).toBe('前文`代码`')
    editor.destroy()
  })

  it('renders inline code when text is inserted between an existing backtick pair', () => {
    const editor = createEditor('前文``后文')
    editor.commands.setTextSelection(4)

    typeText(editor, '代码`')

    expectTextMark(editor, '代码', 'code')
    expect(editor.getMarkdown()).toBe('前文`代码`后文')
    editor.destroy()
  })

  it('keeps triple backticks available for fenced code blocks', () => {
    const editor = createEditor()
    moveCursorToEnd(editor)

    typeText(editor, '``` ')

    expect(editor.isActive('codeBlock')).toBe(true)
    editor.destroy()
  })

  it('renders a CJK-adjacent inline link when its closing parenthesis is typed', () => {
    const editor = createEditor('前文[文档](./guide.md')
    moveCursorToEnd(editor)

    typeText(editor, ')')

    expectTextMark(editor, '文档', 'link')
    expect(editor.getMarkdown()).toBe('前文[文档](./guide.md)')
    editor.destroy()
  })

  it('renders a CJK-adjacent image when its closing parenthesis is typed', () => {
    const editor = createEditor('前文![图](./image.png')
    moveCursorToEnd(editor)

    typeText(editor, ')')

    let image: { src?: string; alt?: string } | null = null
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') {
        image = node.attrs
      }
    })
    expect(image).toMatchObject({ src: './image.png', alt: '图' })
    editor.destroy()
  })
})
