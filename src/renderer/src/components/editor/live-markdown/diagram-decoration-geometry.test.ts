import { EditorState } from '@codemirror/state'
import { expect, it } from 'vitest'
import { markdownEditorExtensions } from './editor-extensions'
import { markdownEditorMode } from './editor-context'
import { liveMarkdownDecorations } from './live-decorations'
import { MarkdownDiagramWidget } from './diagram-widget'

const diagram = '```mermaid\nsequenceDiagram\nA->>B: Send\n```'
const source = `# Report\n\n${diagram}\n\nEnd`
function state(text = source) {
  return EditorState.create({
    doc: text,
    extensions: [markdownEditorExtensions(), markdownEditorMode.of('preview')]
  })
}
function diagrams(value: EditorState) {
  const result: MarkdownDiagramWidget[] = []
  value.field(liveMarkdownDecorations).between(0, value.doc.length, (_from, _to, decoration) => {
    if (decoration.spec.widget instanceof MarkdownDiagramWidget) {
      result.push(decoration.spec.widget)
    }
  })
  return result
}

it('preserves a measured diagram across selections and source changes until it renders again', () => {
  let value = state()
  diagrams(value)[0].geometry.height = 882.5
  value = value.update({ selection: { anchor: value.doc.length } }).state
  expect(diagrams(value)[0].estimatedHeight).toBe(882.5)
  const from = value.doc.toString().indexOf('Send')
  value = value.update({ changes: { from, to: from + 4, insert: 'Reply' } }).state
  expect(diagrams(value)[0].estimatedHeight).toBe(882.5)
  expect(diagrams(value)[0].source).toContain('Reply')
})

it('maps diagram height through text inserted before the diagram', () => {
  const value = state()
  diagrams(value)[0].geometry.height = 868
  const next = value.update({ changes: { from: 0, insert: 'Introduction\n\n' } }).state
  expect(diagrams(next)[0].estimatedHeight).toBe(868)
  expect(diagrams(next)[0].position).toBe(diagrams(value)[0].position + 'Introduction\n\n'.length)
})

it('retains the remaining diagram geometry when an earlier diagram is deleted', () => {
  const value = state(`${diagram}\n\n${diagram}\n\nEnd`)
  const before = diagrams(value)
  before[0].geometry.height = 400
  before[1].geometry.height = 900
  const next = value.update({ changes: { from: 0, to: diagram.length + 2 } }).state
  expect(diagrams(next)).toHaveLength(1)
  expect(diagrams(next)[0].estimatedHeight).toBe(900)
})
