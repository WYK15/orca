import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { liveMarkdownDecorations } from './live-decorations'
import { markdownEditorMode, type MarkdownEditorMode } from './editor-context'

function headingState(text: string, mode: MarkdownEditorMode = 'live') {
  return EditorState.create({
    doc: text,
    extensions: [
      markdown({ base: markdownLanguage }),
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

it.each([1, 2, 3, 4, 5, 6])('keeps %i typed hashes visible until a space is entered', (level) => {
  let state = headingState('')
  for (let index = 0; index < level; index++) {
    state = state.update({ changes: { from: state.doc.length, insert: '#' } }).state
    expect(presentation(state).classes).not.toContain('live-md-heading')
    expect(presentation(state).hidden).toBe(0)
  }
  state = state.update({ changes: { from: state.doc.length, insert: ' ' } }).state
  expect(presentation(state).classes).toContain(`live-md-h${level}`)
  expect(presentation(state).hidden).toBe(1)
  state = state.update({ changes: { from: state.doc.length - 1, to: state.doc.length } }).state
  expect(presentation(state).classes).not.toContain('live-md-heading')
  expect(presentation(state).hidden).toBe(0)
})

it('keeps hash-prefixed words ordinary and renders existing spaced headings', () => {
  expect(presentation(headingState('##word')).classes).not.toContain('live-md-heading')
  expect(presentation(headingState('## 标题')).classes).toContain('live-md-h2')
  expect(presentation(headingState('## 标题', 'source')).hidden).toBe(0)
  expect(presentation(headingState('##', 'preview')).classes).toContain('live-md-h2')
})
