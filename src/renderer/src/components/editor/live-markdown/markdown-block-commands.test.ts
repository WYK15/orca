import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  setMarkdownHeading,
  toggleMarkdownBlock,
  completeMarkdownTable,
  indentMarkdownList
} from './markdown-block-commands'
import { tableCellSelection } from './table-cell-selection'

function editor(text: string, anchor = text.length, head = anchor) {
  let state = EditorState.create({
    doc: text,
    selection: { anchor, head },
    extensions: [markdown({ base: markdownLanguage }), tableCellSelection]
  })
  return {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = transaction.state
    }
  }
}

it.each([
  ['paragraph', 2, '## paragraph'],
  ['# title', 3, '### title'],
  ['## title', 0, 'title'],
  ['Title\n-----', 2, '## Title'],
  ['> quote', 2, '> ## quote']
] as const)('changes the current paragraph %s into heading level %i', (source, level, expected) => {
  const target = editor(source, !source.includes('\n') ? source.length : 2)
  expect(setMarkdownHeading(level)(target)).toBe(true)
  expect(target.state.doc.toString()).toBe(expected)
})

it('changes each selected paragraph without inserting a new blank block', () => {
  const target = editor('one\ntwo\nuntouched', 0, 7)
  setMarkdownHeading(2)(target)
  expect(target.state.doc.toString()).toBe('## one\n## two\nuntouched')
})

it('keeps tables, fences and blank lines intact when converting a mixed selection', () => {
  const source = 'before\n\n| A | B |\n| --- | --- |\n| x | y |\n\n```\ncode\n```\n\nafter'
  const target = editor(source, 0, source.length)
  setMarkdownHeading(2)(target)
  expect(target.state.doc.toString()).toBe(
    source.replace('before', '## before').replace('after', '## after')
  )
})

it('toggles the selected lines as a list and quote', () => {
  const target = editor('one\ntwo', 0, 7)
  toggleMarkdownBlock('- ')(target)
  expect(target.state.doc.toString()).toBe('- one\n- two')
  toggleMarkdownBlock('- ')(target)
  expect(target.state.doc.toString()).toBe('one\ntwo')
  toggleMarkdownBlock('> ')(target)
  expect(target.state.doc.toString()).toBe('> one\n> two')
})

it('creates a table from its typed header and selects its first body cell', () => {
  const target = editor('| A | B |')
  expect(completeMarkdownTable(target)).toBe(true)
  expect(target.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n|   |   |')
  expect(target.state.field(tableCellSelection)?.from).toBe(target.state.selection.main.head)
})

it.each(['```\n| A | B |\n```', '| A | B |\n| --- | --- |\n| x | y |', 'ordinary | text'])(
  'does not create a second table inside %s',
  (source) => {
    const target = editor(
      source,
      source.includes('| A | B |') ? source.indexOf('| A | B |') + 9 : source.length
    )
    expect(completeMarkdownTable(target)).toBe(false)
    expect(target.state.doc.toString()).toBe(source)
  }
)

it('indents and outdents an item together with its nested children', () => {
  const source = '- first\n- second\n  - child\n- third'
  const target = editor(source, source.indexOf('second') + 3)
  expect(indentMarkdownList(false)(target)).toBe(true)
  expect(target.state.doc.toString()).toBe('- first\n  - second\n    - child\n- third')
  expect(indentMarkdownList(true)(target)).toBe(true)
  expect(target.state.doc.toString()).toBe(source)
})
