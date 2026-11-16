import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { liveMarkdownDecorations } from './live-decorations'
import { markdownEditorMode, type MarkdownEditorMode } from './editor-context'
import { syntaxTree } from '@codemirror/language'
import { markdownDocumentModel } from './markdown-document-model'
import { MarkdownTableWidget } from './table-widget'

function headingState(text: string, mode: MarkdownEditorMode = 'live') {
  return EditorState.create({
    doc: text,
    extensions: [
      markdown({ base: markdownLanguage }),
      markdownDocumentModel,
      markdownEditorMode.of(mode),
      liveMarkdownDecorations
    ]
  })
}
function presentation(state: EditorState) {
  const classes: string[] = []
  let hidden = 0
  state.field(liveMarkdownDecorations).between(0, state.doc.length, (from, to, decoration) => {
    if (decoration.spec.class) {
      classes.push(decoration.spec.class)
    }
    if (to > from && !decoration.spec.class) {
      hidden++
    }
  })
  return { classes: classes.join(' '), hidden }
}

it.each([1, 2, 3, 4, 5, 6])(
  'keeps %i typed hashes visible until heading text is entered',
  (level) => {
    let state = headingState('')
    for (let index = 0; index < level; index++) {
      state = state.update({ changes: { from: state.doc.length, insert: '#' } }).state
      expect(presentation(state).classes).not.toContain('live-md-heading')
      expect(presentation(state).hidden).toBe(0)
    }
    state = state.update({ changes: { from: state.doc.length, insert: ' ' } }).state
    expect(presentation(state).classes).not.toContain('live-md-heading')
    expect(presentation(state).hidden).toBe(0)
    state = state.update({
      changes: { from: state.doc.length, insert: 'h2' },
      selection: { anchor: state.doc.length + 2 }
    }).state
    expect(presentation(state).classes).toContain(`live-md-h${level}`)
    expect(presentation(state).hidden).toBe(1)
    state = state.update({ changes: { from: state.doc.length - 2, to: state.doc.length } }).state
    state = state.update({ changes: { from: state.doc.length - 1, to: state.doc.length } }).state
    expect(presentation(state).classes).not.toContain('live-md-heading')
    expect(presentation(state).hidden).toBe(0)
  }
)

it('keeps hash-prefixed words ordinary and renders existing spaced headings', () => {
  expect(presentation(headingState('##word')).classes).not.toContain('live-md-heading')
  expect(presentation(headingState('## 标题')).classes).toContain('live-md-h2')
  expect(presentation(headingState('## 标题', 'source')).hidden).toBe(0)
  expect(presentation(headingState('##', 'preview')).classes).toContain('live-md-h2')
})

it('renders tables and headings beyond the initial parser viewport before background work', () => {
  const prefix = `# Title\n\n${'Intro paragraph.\n\n'.repeat(300)}`
  const state = headingState(
    `${prefix}## Later section\n\n| Key | Value |\n| --- | --- |\n| a | b |`
  )
  expect(syntaxTree(state).length).toBeLessThan(prefix.length)
  let tables = 0
  state
    .field(liveMarkdownDecorations)
    .between(prefix.length, state.doc.length, (_from, _to, decoration) => {
      if (decoration.spec.widget instanceof MarkdownTableWidget) {
        tables++
      }
    })
  expect(tables).toBe(1)
  expect(presentation(state).classes).toContain('live-md-h2')
})
