import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { selectTableCell, tableCellSelection } from './table-cell-selection'
import { markdownEditorMode, revealedTableField } from './editor-context'

it('restores a caret inside a table to its rendered cell without changing source', () => {
  const source = '| A | B |\n| --- | --- |\n| x | value |'
  const state = EditorState.create({
    doc: source,
    selection: { anchor: source.indexOf('value') + 2 },
    extensions: [markdown({ base: markdownLanguage }), revealedTableField, tableCellSelection]
  })
  expect(state.field(tableCellSelection)).toEqual({
    from: source.indexOf('value'),
    to: source.indexOf('value') + 5
  })
  expect(state.doc.toString()).toBe(source)
  const outside = state.update({ selection: { anchor: 0 } }).state
  expect(outside.field(tableCellSelection)).toBeNull()
  const moved = outside.update({ selection: { anchor: source.indexOf(' x ') + 1 } }).state
  expect(moved.field(tableCellSelection)?.from).toBe(source.indexOf(' x ') + 1)
})

it('does not take table ownership in source mode', () => {
  const source = '| A | B |\n| --- | --- |\n| x | value |'
  const state = EditorState.create({
    doc: source,
    selection: { anchor: source.indexOf('value') },
    extensions: [
      markdown({ base: markdownLanguage }),
      markdownEditorMode.of('source'),
      tableCellSelection
    ]
  })
  expect(state.field(tableCellSelection)).toBeNull()
})

it('retains ownership of typed trailing spaces when a cell is reparsed', () => {
  let state = EditorState.create({ doc: '| old    |', extensions: [tableCellSelection] })
  state = state.update({ effects: selectTableCell.of({ from: 2, to: 5 }) }).state
  state = state.update({ changes: { from: 2, to: 5, insert: 'new ' } }).state
  expect(state.field(tableCellSelection)).toEqual({ from: 2, to: 6 })
  const cell = state.field(tableCellSelection)!
  state = state.update({ changes: { ...cell, insert: 'new value' } }).state
  expect(state.doc.toString()).toBe('| new value    |')
})
