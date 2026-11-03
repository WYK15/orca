import { EditorState } from '@codemirror/state'
import { expect, it } from 'vitest'
import { markdownEditorExtensions } from './editor-extensions'
import { liveMarkdownDecorations } from './live-decorations'
import { MarkdownTableWidget } from './table-widget'
import { selectCellTransaction } from './table-edit-transactions'

const source = [
  '# Report',
  '',
  '| Earlier | Value |',
  '| --- | --- |',
  '| first | before |',
  '',
  '## Current section',
  '',
  '| Current | Value |',
  '| --- | --- |',
  '| selected | text |',
  '',
  '## Following section',
  '',
  '| Later | Value |',
  '| --- | --- |',
  '| third | after |'
].join('\n')

function widgets(state: EditorState): MarkdownTableWidget[] {
  const tables: MarkdownTableWidget[] = []
  state.field(liveMarkdownDecorations).between(0, state.doc.length, (_from, _to, decoration) => {
    if (decoration.spec.widget instanceof MarkdownTableWidget) {
      tables.push(decoration.spec.widget)
    }
  })
  return tables
}

function documentState() {
  return EditorState.create({
    doc: source,
    selection: { anchor: source.indexOf('## Current') },
    extensions: markdownEditorExtensions()
  })
}

it('retains unrelated table widgets and their measured geometry when entering a cell', () => {
  const state = documentState()
  const before = widgets(state)
  expect(before).toHaveLength(3)
  const selected = state.update(
    selectCellTransaction(state, before[1].table, { row: 1, column: 0 })
  ).state
  const after = widgets(selected)

  expect(after[0].eq(before[0])).toBe(true)
  expect(after[1].eq(before[1])).toBe(false)
  expect(after[2].eq(before[2])).toBe(true)
  expect(selected.doc.toString()).toBe(source)

  const moved = selected.update({ selection: { anchor: selected.selection.main.head + 1 } }).state
  const next = widgets(moved)
  expect(next[0].eq(after[0])).toBe(true)
  expect(next[1].eq(after[1])).toBe(false)
  expect(next[2].eq(after[2])).toBe(true)
})

it('retains table widgets when moving the caret between ordinary paragraphs', () => {
  const state = documentState()
  const before = widgets(state)
  const after = widgets(
    state.update({ selection: { anchor: source.indexOf('## Following') } }).state
  )
  expect(after.map((table, index) => table.eq(before[index]))).toEqual([true, true, true])
})

it('refreshes every table touched by a cross-table selection', () => {
  const state = documentState()
  const before = widgets(state)
  const after = widgets(
    state.update({
      selection: {
        anchor: before[0].table.rows[1].cells[0].from,
        head: before[1].table.rows[1].cells[1].to
      }
    }).state
  )
  expect(after.map((table, index) => table.eq(before[index]))).toEqual([false, false, true])
})
