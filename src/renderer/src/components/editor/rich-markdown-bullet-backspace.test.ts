import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { createIsolatedMarkdownExtensionForTests } from './isolated-markdown-extension-for-tests'
import { removeEmptyBulletMarker } from './rich-markdown-bullet-backspace'

function createEditor(source: string): Editor {
  return new Editor({
    element: null,
    extensions: [StarterKit, createIsolatedMarkdownExtensionForTests()],
    content: source,
    contentType: 'markdown'
  })
}

function selectEmptyParagraph(editor: Editor): void {
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.content.size === 0) {
      editor.commands.setTextSelection(pos + 1)
      return false
    }
    return true
  })
}

describe('Backspace on an empty bullet', () => {
  it('removes the new bullet but keeps a continuation line in the previous item', () => {
    const editor = createEditor('- **说明**')
    try {
      editor.commands.setTextSelection(5)
      editor.commands.splitListItem('listItem')
      expect(removeEmptyBulletMarker(editor)).toBe(true)
      const list = editor.state.doc.firstChild!
      expect(list.childCount).toBe(1)
      expect(list.firstChild!.firstChild!.lastChild!.type.name).toBe('hardBreak')
      expect(editor.state.selection.$from.nodeBefore!.type.name).toBe('hardBreak')
      expect(removeEmptyBulletMarker(editor)).toBe(false)
      editor.view.dispatch(editor.state.tr.insertText('续行'))
      expect(editor.getMarkdown()).toBe('- **说明**  \n续行')
      expect(editor.state.doc.firstChild!.childCount).toBe(1)
      const reloaded = createEditor(editor.getMarkdown())
      try {
        expect(reloaded.state.doc.toJSON()).toEqual(editor.state.doc.toJSON())
      } finally {
        reloaded.destroy()
      }
    } finally {
      editor.destroy()
    }
  })

  it.each(['- ', '- \n- 后项'])(
    'removes the first bullet without losing later items: %s',
    (source) => {
      const editor = createEditor(source)
      try {
        editor.commands.setContent({
          type: 'doc',
          content: [
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph' }] },
                ...(source.includes('后项')
                  ? [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: '后项' }]
                          }
                        ]
                      }
                    ]
                  : [])
              ]
            }
          ]
        })
        selectEmptyParagraph(editor)
        expect(removeEmptyBulletMarker(editor)).toBe(true)
        expect(editor.state.doc.firstChild!.type.name).toBe('paragraph')
        expect(editor.state.selection.from).toBe(1)
        if (source.includes('后项')) {
          expect(editor.state.doc.lastChild!.type.name).toBe('bulletList')
          expect(editor.state.doc.lastChild!.textContent).toBe('后项')
        }
      } finally {
        editor.destroy()
      }
    }
  )

  it('keeps a nested continuation inside its parent item', () => {
    const editor = createEditor('- 父项\n  - 子项\n  - ')
    try {
      selectEmptyParagraph(editor)
      expect(removeEmptyBulletMarker(editor)).toBe(true)
      const parent = editor.state.doc.firstChild!.firstChild!
      expect(parent.firstChild!.textContent).toBe('父项')
      expect(parent.lastChild!.type.name).toBe('bulletList')
      expect(parent.lastChild!.childCount).toBe(1)
      expect(editor.state.selection.$from.nodeBefore!.type.name).toBe('hardBreak')
    } finally {
      editor.destroy()
    }
  })

  it.each(['1. 说明\n2. ', '- 非空项', '普通段落'])(
    'preserves the existing behavior for %s',
    (source) => {
      const editor = createEditor(source)
      try {
        selectEmptyParagraph(editor)
        const before = editor.state
        expect(removeEmptyBulletMarker(editor)).toBe(false)
        expect(editor.state).toBe(before)
      } finally {
        editor.destroy()
      }
    }
  )
})
