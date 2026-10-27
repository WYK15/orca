import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { prepareMarkdownBlockInsertion } from './markdown-block-insertion'
import { markdownDocumentModel, readMarkdownDocumentTree } from './markdown-document-model'

it.each([
  ['1. alpha\n   ', '   '],
  ['> 1. alpha\n>    ', '>    '],
  ['> alpha\n> ', '> ']
])('keeps a newly inserted block in its container in %j', (source, prefix) => {
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), markdownDocumentModel]
  })
  const insertion = prepareMarkdownBlockInsertion(state, source.length, source.length, '```\n\n```')
  const next = state.update({
    changes: insertion.change,
    selection: { anchor: insertion.position(4) }
  }).state
  expect(next.doc.lineAt(next.selection.main.head).text).toBe(prefix)
  expect(next.doc.toString()).toContain(`\n${prefix}\n${prefix}\`\`\``)
  let valid = false
  readMarkdownDocumentTree(next).iterate({
    enter(n) {
      if (n.name === 'FencedCode') {
        valid = n.node.getChildren('CodeMark').length === 2 && n.node.parent?.name !== 'Document'
      }
    }
  })
  expect(valid).toBe(true)
})

it('separates a block inserted mid-paragraph without rewriting unselected text', () => {
  const source = '1. alpha tail\n2. next'
  const state = EditorState.create({
    doc: source,
    extensions: [markdown({ base: markdownLanguage }), markdownDocumentModel]
  })
  const insertion = prepareMarkdownBlockInsertion(state, 8, 8, '```\nx\n```')
  const next = state.update({ changes: insertion.change }).state.doc.toString()
  expect(next).toBe('1. alpha\n\n   ```\n   x\n   ```\n\n    tail\n2. next')
})
