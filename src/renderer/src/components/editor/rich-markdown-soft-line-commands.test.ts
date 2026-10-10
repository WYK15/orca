// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'
import { runSlashCommand, slashCommands, syncSlashMenu } from './rich-markdown-slash-commands'

function createEditor(source = '- 说明'): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
    content: source,
    contentType: 'markdown'
  })
}

function typeText(editor: Editor, text: string): void {
  for (const character of text) {
    const { from, to } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, character, () => editor.state.tr.insertText(character))
    )
    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(character))
    }
  }
}

function prepareLine(editor: Editor, text: string): void {
  editor.commands.setTextSelection(editor.state.doc.content.size - 3)
  editor.commands.setHardBreak()
  typeText(editor, text)
}

function syncMenu(editor: Editor) {
  vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ left: 10, right: 10, top: 10, bottom: 20 })
  const setMenu = vi.fn()
  syncSlashMenu(editor, document.createElement('div'), setMenu)
  return setMenu
}

describe('rich Markdown commands after Shift+Enter', () => {
  it('opens the slash menu at a soft-line start and keeps the exact trigger range', () => {
    const editor = createEditor()
    try {
      prepareLine(editor, '/code')
      const to = editor.state.selection.from
      expect(syncMenu(editor)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: 'code',
          from: to - 5,
          to
        })
      )
    } finally {
      editor.destroy()
    }
  })

  it.each(['code-block', 'heading-2'] as const)(
    'applies %s to the continuation without replacing the list description',
    (id) => {
      const editor = createEditor()
      try {
        prepareLine(editor, '/')
        const to = editor.state.selection.from
        const command = slashCommands.find((candidate) => candidate.id === id)!
        runSlashCommand(editor, { from: to - 1, to }, command)
        const item = editor.state.doc.firstChild!.firstChild!
        expect(item.childCount).toBe(2)
        expect(item.firstChild!.textContent).toBe('说明')
        expect(item.lastChild!.type.name).toBe(id === 'code-block' ? 'codeBlock' : 'heading')
        expect(editor.state.selection.$from.parent.type.name).toBe(item.lastChild!.type.name)
      } finally {
        editor.destroy()
      }
    }
  )

  it.each([' ', 'Enter'])('creates a code block after a soft-line fence using %s', (key) => {
    const editor = createEditor()
    try {
      prepareLine(editor, '```js')
      if (key === ' ') {
        typeText(editor, key)
      } else {
        editor.view.someProp('handleKeyDown', (handler) =>
          handler(editor.view, new KeyboardEvent('keydown', { key }))
        )
      }
      const item = editor.state.doc.firstChild!.firstChild!
      expect(item.childCount).toBe(2)
      expect(item.firstChild!.textContent).toBe('说明')
      expect(item.lastChild!.type.name).toBe('codeBlock')
      expect(item.lastChild!.attrs.language).toBe('js')
      typeText(editor, 'const x = 1')
      const reloaded = createEditor(editor.getMarkdown())
      try {
        expect(reloaded.state.doc.firstChild!.firstChild!.firstChild!.textContent).toBe('说明')
        expect(reloaded.state.doc.firstChild!.firstChild!.lastChild!.type.name).toBe('codeBlock')
        expect(reloaded.state.doc.firstChild!.firstChild!.lastChild!.textContent).toBe(
          'const x = 1'
        )
      } finally {
        reloaded.destroy()
      }
    } finally {
      editor.destroy()
    }
  })

  it('keeps slashes within continuation text literal', () => {
    const editor = createEditor()
    try {
      prepareLine(editor, '正文/code')
      expect(syncMenu(editor)).toHaveBeenLastCalledWith(null)
    } finally {
      editor.destroy()
    }
  })

  it('preserves formatted descriptions, later soft lines, and sibling list items', () => {
    const editor = createEditor('- **说明**\n- 后项')
    try {
      editor.commands.setTextSelection(5)
      editor.commands.setHardBreak()
      typeText(editor, '/')
      const to = editor.state.selection.from
      editor.commands.setHardBreak()
      typeText(editor, '尾行')
      editor.commands.setTextSelection(to)
      runSlashCommand(
        editor,
        { from: to - 1, to },
        slashCommands.find((command) => command.id === 'code-block')!
      )

      const list = editor.state.doc.firstChild!
      const item = list.firstChild!
      expect(list.childCount).toBe(2)
      expect(list.lastChild!.textContent).toBe('后项')
      expect(item.childCount).toBe(3)
      expect(item.child(0).textContent).toBe('说明')
      expect(item.child(0).firstChild!.marks[0].type.name).toBe('bold')
      expect(item.child(1).type.name).toBe('codeBlock')
      expect(item.child(2).textContent).toBe('尾行')
    } finally {
      editor.destroy()
    }
  })

  it('inserts emoji on the same soft line without splitting the list paragraph', () => {
    const editor = createEditor()
    try {
      prepareLine(editor, '/')
      const to = editor.state.selection.from
      runSlashCommand(
        editor,
        { from: to - 1, to },
        slashCommands.find((command) => command.id === 'emoji')!,
        undefined,
        () => {
          editor.commands.insertContent('🙂')
        }
      )
      const item = editor.state.doc.firstChild!.firstChild!
      expect(item.childCount).toBe(1)
      expect(item.firstChild!.child(1).type.name).toBe('hardBreak')
      expect(item.textContent).toBe('说明🙂')
    } finally {
      editor.destroy()
    }
  })

  it('does not open a slash menu in a fenced code block', () => {
    const editor = createEditor('```\n/code\n```')
    try {
      editor.commands.setTextSelection(6)
      expect(syncMenu(editor)).toHaveBeenLastCalledWith(null)
    } finally {
      editor.destroy()
    }
  })
})
