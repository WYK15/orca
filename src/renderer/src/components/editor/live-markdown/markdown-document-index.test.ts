import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import {
  markdownDocumentModel,
  readMarkdownDocument,
  buildMarkdownDocument
} from './markdown-document-model'
import { markdownSourceImages } from './markdown-links'

it('indexes headings and distant references without requiring a viewport syntax tree', () => {
  const source = `![image][last]\n\nNote[^n]\n\n${Array.from({ length: 2000 }, (_, index) => `## Heading ${index}\n\nParagraph.\n\n`).join('')}[last]: final.png\n\n[^n]: Final note`
  const state = EditorState.create({ doc: source, extensions: [markdownDocumentModel] })
  const model = readMarkdownDocument(state)
  expect(model.headings).toHaveLength(2000)
  expect(model.headings.at(-1)?.title).toBe('Heading 1999')
  expect(model.notes[0].body).toBe('Final note')
  expect(markdownSourceImages(state)[0].src).toBe('final.png')
})
it('keeps an incrementally updated document index equivalent to a complete parse', () => {
  let state = EditorState.create({
    doc: '# Repeat\n\n# Repeat\n\nText[^a]\n\n[id]: one.png\n\n[^a]: Note\n\nend',
    extensions: [markdownDocumentModel]
  })
  const edits = [
    { from: 0, insert: '---\ntitle: Value\n---\n\n' },
    { from: 4, to: 16, insert: 'title: New value' },
    { from: 0, insert: '# Preface\n\n' }
  ]
  for (const edit of edits) {
    state = state.update({ changes: edit }).state
    expect(readMarkdownDocument(state)).toEqual(buildMarkdownDocument(state))
  }
  const at = state.doc.toString().indexOf('[^a]:')
  state = state.update({ changes: { from: at, insert: '[^b]: Other\n\n' } }).state
  expect(readMarkdownDocument(state)).toEqual(buildMarkdownDocument(state))
})
