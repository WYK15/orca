import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { history, undo } from '@codemirror/commands'
import { markdownDocumentSyntax } from './markdown-document-syntax'
import { markdownDocumentBreak } from './markdown-document-commands'
import { markdownEditorMode, type MarkdownEditorMode } from './editor-context'
import {
  markdownSourceExtensions,
  markdownSourceField,
  createSourceDocument
} from './source-document'
import { removeListMarker, paragraphBreak } from './editor-commands'
import { toggleMarkdownInline } from './markdown-inline-format'

function target(source: string, anchor?: number, mode: MarkdownEditorMode = 'live') {
  const text = createSourceDocument(source).text
  let state = EditorState.create({
    doc: text,
    selection: { anchor: anchor ?? text.length },
    extensions: [
      markdown({ base: markdownLanguage, extensions: markdownDocumentSyntax }),
      markdownSourceExtensions(source),
      history(),
      markdownEditorMode.of(mode)
    ]
  })
  return {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = transaction.state
    }
  }
}

it.each([
  ['---', '---\n\n---', 4],
  ['$$', '$$\n\n$$', 3]
])('completes %s as one undoable source edit', (source, expected, caret) => {
  const editor = target(source as string)
  expect(markdownDocumentBreak(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe(expected)
  expect(editor.state.selection.main.head).toBe(caret)
  expect(undo(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe(source)
})

it.each(['---\ntitle: Hello\n---', '$$\nx + y\n$$'])(
  'uses a literal newline inside %s',
  (source) => {
    const anchor = source.indexOf('\n', source.indexOf('\n') + 1)
    const editor = target(source, anchor)
    expect(markdownDocumentBreak(editor)).toBe(true)
    expect(editor.state.doc.toString()).toBe(`${source.slice(0, anchor)}\n${source.slice(anchor)}`)
    expect(paragraphBreak(editor)).toBe(false)
  }
)

it('keeps mixed endings, entities and unrelated text byte-identical through editing and undo', () => {
  const source = '---\r\ntitle: Old\r\n---\n\nBefore -> &gt;\r\n\r\n$x$'
  const editor = target(source, 14)
  expect(markdownDocumentBreak(editor)).toBe(true)
  expect(editor.state.field(markdownSourceField).raw).toBe(
    '---\r\ntitle: Old\r\n\r\n---\n\nBefore -> &gt;\r\n\r\n$x$'
  )
  expect(undo(editor)).toBe(true)
  expect(editor.state.field(markdownSourceField).raw).toBe(source)
})

it('continues footnote paragraphs with indentation and exits an empty continuation', () => {
  const editor = target('[^note]: First')
  expect(markdownDocumentBreak(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe('[^note]: First\n    ')
  expect(markdownDocumentBreak(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe('[^note]: First\n\n')
})

it('does not apply list deletion or inline formatting to literal YAML and math', () => {
  for (const source of ['---\n- text\n---', '$$\n- text\n$$']) {
    const editor = target(source, source.indexOf('- ') + 2)
    expect(removeListMarker(editor)).toBe(false)
    expect(toggleMarkdownInline('**')(editor)).toBe(false)
    expect(editor.state.doc.toString()).toBe(source)
  }
})

it('leaves source mode Enter to the code editor', () => {
  const editor = target('---', undefined, 'source')
  expect(markdownDocumentBreak(editor)).toBe(false)
  expect(paragraphBreak(editor)).toBe(false)
})
