// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import {
  insertRichMarkdownTable,
  validateRichMarkdownTableDimensions
} from './rich-markdown-table-insertion'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'

let editor: Editor | null = null

function createEditor(): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
    content: 'Before',
    contentType: 'markdown'
  })
  return editor
}

function tableDimensions(currentEditor: Editor): { rows: number; columns: number } {
  let rows = 0
  let columns = 0
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow') {
      rows += 1
      columns = Math.max(columns, node.childCount)
    }
  })
  return { rows, columns }
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('rich Markdown table insertion', () => {
  it.each([
    [{ bodyRows: 1, columns: 1 }, true],
    [{ bodyRows: 100, columns: 50 }, true],
    [{ bodyRows: 0, columns: 3 }, false],
    [{ bodyRows: 101, columns: 3 }, false],
    [{ bodyRows: 3, columns: 0 }, false],
    [{ bodyRows: 3, columns: 51 }, false],
    [{ bodyRows: 1.5, columns: 3 }, false]
  ] as const)('validates %j', (dimensions, expected) => {
    expect(validateRichMarkdownTableDimensions(dimensions)).toBe(expected)
  })

  it('adds one header row to the requested body rows', () => {
    const currentEditor = createEditor()
    expect(insertRichMarkdownTable(currentEditor, { bodyRows: 3, columns: 4 })).toBe(true)
    expect(tableDimensions(currentEditor)).toEqual({ rows: 4, columns: 4 })
    expect(currentEditor.getMarkdown()).toContain('| ---')
  })

  it('does not mutate the document for invalid dimensions', () => {
    const currentEditor = createEditor()
    const before = currentEditor.getMarkdown()
    expect(insertRichMarkdownTable(currentEditor, { bodyRows: 0, columns: 3 })).toBe(false)
    expect(currentEditor.getMarkdown()).toBe(before)
  })
})
