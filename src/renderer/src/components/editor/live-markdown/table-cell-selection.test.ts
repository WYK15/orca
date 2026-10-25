import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { selectTableCell, tableCellSelection } from './table-cell-selection'

it('retains ownership of typed trailing spaces when a cell is reparsed', () => {
  let state = EditorState.create({ doc: '| old    |', extensions: [tableCellSelection] })
  state = state.update({ effects: selectTableCell.of({ from: 2, to: 5 }) }).state
  state = state.update({ changes: { from: 2, to: 5, insert: 'new ' } }).state
  expect(state.field(tableCellSelection)).toEqual({ from: 2, to: 6 })
  const cell = state.field(tableCellSelection)!
  state = state.update({ changes: { ...cell, insert: 'new value' } }).state
  expect(state.doc.toString()).toBe('| new value    |')
})
