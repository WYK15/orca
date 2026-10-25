import { describe, expect, it } from 'vitest'
import type { Transaction } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import {
  createSourceDocument,
  markdownSourceExtensions,
  markdownSourceField
} from './source-document'

function document(raw: string) {
  let state = EditorState.create({
    doc: createSourceDocument(raw).text,
    extensions: [markdownSourceExtensions(raw), history()]
  })
  return {
    get state() {
      return state
    },
    dispatch: (transaction: Transaction) => {
      state = transaction.state
    }
  }
}

describe('source-preserving Markdown document', () => {
  it('preserves mixed line endings, HTML, entities and whitespace when one word changes', () => {
    const raw =
      '\ufeff# 手册\r\n\r\n<p>before -> &gt;</p>\n\n| 说明 |\r\n| --- |\r\n| http old |\r\n'
    const doc = document(raw)
    const from = doc.state.doc.toString().indexOf('old')
    doc.dispatch(doc.state.update({ changes: { from, to: from + 3, insert: 'new' } }))
    expect(doc.state.field(markdownSourceField).raw).toBe(raw.replace('old', 'new'))
  })

  it('restores exact original bytes after undoing a multi-line deletion', () => {
    const raw = '# 文档\r\n\r\n## 1.3\nold text\r\n\r\n## 1.5\r\n![privacy](./res/privacy.png)\n'
    const doc = document(raw)
    const text = doc.state.doc.toString()
    const from = text.indexOf('## 1.3')
    const to = text.indexOf('## 1.5')
    doc.dispatch(doc.state.update({ changes: { from, to } }))
    expect(doc.state.field(markdownSourceField).raw).toBe(
      '# 文档\r\n\r\n## 1.5\r\n![privacy](./res/privacy.png)\n'
    )
    expect(undo(doc)).toBe(true)
    expect(doc.state.field(markdownSourceField).raw).toBe(raw)
    expect(redo(doc)).toBe(true)
    expect(doc.state.field(markdownSourceField).raw).not.toContain('1.3')
  })

  it('uses the existing newline style for insertions without touching later lines', () => {
    const doc = document('one\r\ntwo\nthree\r')
    doc.dispatch(doc.state.update({ changes: { from: 3, insert: '\nnew' } }))
    expect(doc.state.field(markdownSourceField).raw).toBe('one\r\nnew\r\ntwo\nthree\r')
  })

  it('keeps all undo groups byte-exact, including merged typing and multiple edits', () => {
    const raw = '一\r\n二\n三\r\n'
    const doc = document(raw)
    for (const value of ['A', 'B', 'C']) {
      doc.dispatch(
        doc.state.update({ changes: { from: 0, insert: value }, userEvent: 'input.type' })
      )
    }
    expect(undo(doc)).toBe(true)
    expect(doc.state.field(markdownSourceField).raw).toBe(raw)
    expect(redo(doc)).toBe(true)
    expect(doc.state.field(markdownSourceField).raw).toBe(`CBA${raw}`)
  })

  it('restores deleted mixed line endings after grouped edits at different positions', () => {
    const raw = 'A\r\nB\nC\r\nD\rE\nF'
    const doc = document(raw)
    doc.dispatch(doc.state.update({ changes: { from: 1, to: 4 }, userEvent: 'delete.forward' }))
    doc.dispatch(doc.state.update({ changes: { from: 1, to: 3 }, userEvent: 'delete.forward' }))
    undo(doc)
    expect(doc.state.field(markdownSourceField).raw).toBe(raw)
    redo(doc)
    expect(doc.state.field(markdownSourceField).text).toBe(doc.state.doc.toString())
  })

  it('restores a large deletion with mixed line endings without losing any source bytes', () => {
    const raw = Array.from(
      { length: 5000 },
      (_, index) => `paragraph ${index}${index % 2 ? '\r\n' : '\n'}`
    ).join('')
    const doc = document(raw)
    doc.dispatch(doc.state.update({ changes: { from: 0, to: doc.state.doc.length } }))
    expect(undo(doc)).toBe(true)
    expect(doc.state.field(markdownSourceField).raw).toBe(raw)
  })
})
