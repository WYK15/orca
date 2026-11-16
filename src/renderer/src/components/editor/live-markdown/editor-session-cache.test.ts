import { EditorState, StateEffect } from '@codemirror/state'
import { ensureSyntaxTree, language, syntaxTree } from '@codemirror/language'
import { undoDepth } from '@codemirror/commands'
import { expect, it } from 'vitest'
import { markdownEditorExtensions } from './editor-extensions'
import { cacheMarkdownEditorSession, readMarkdownEditorSession } from './editor-session-cache'
import { markdownSourceExtensions } from './source-document'
import { readMarkdownDocumentTree } from './markdown-document-model'

it('retains parsed Markdown, document index, history and selection when restoring a tab', () => {
  const source = `# Title\n\n${'Paragraph **text**.\n\n'.repeat(400)}`
  const extensions = () => [markdownSourceExtensions(source), markdownEditorExtensions()]
  let state = EditorState.create({ doc: source, extensions: extensions() })
  state = state.update({
    changes: { from: source.length, insert: 'Saved draft' },
    selection: { anchor: 100 }
  }).state
  expect(ensureSyntaxTree(state, state.doc.length, 1000)).not.toBeNull()
  state = state.update({}).state
  expect(syntaxTree(state).length).toBe(state.doc.length)
  const tree = syntaxTree(state)
  const index = readMarkdownDocumentTree(state)
  cacheMarkdownEditorSession('parsed-session', state, 1800)
  const cached = readMarkdownEditorSession('parsed-session', state.doc.toString())!
  const restored = cached.state.update({ effects: StateEffect.reconfigure.of(extensions()) }).state
  expect(restored.facet(language)).toBe(state.facet(language))
  expect(syntaxTree(restored)).toBe(tree)
  expect(readMarkdownDocumentTree(restored)).toBe(index)
  expect(restored.doc.toString()).toBe(state.doc.toString())
  expect(restored.selection.main.head).toBe(100)
  expect(undoDepth(restored)).toBe(1)
  expect(cached.scrollTop).toBe(1800)
})
