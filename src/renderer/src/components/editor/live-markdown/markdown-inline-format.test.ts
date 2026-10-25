import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { toggleMarkdownInline, type MarkdownInlineFormat } from './markdown-inline-format'
import { clearMarkdownInlineFormat } from './markdown-clear-format'

function editor(text: string, anchor: number, head = anchor) {
  let state = EditorState.create({
    doc: text,
    selection: { anchor, head },
    extensions: [markdown({ base: markdownLanguage })]
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
  ['**', '**bold**', 2, 6, 'bold'],
  ['**', '**bold**', 0, 8, 'bold'],
  ['**', '__bold__', 3, 3, 'bold'],
  ['*', '*italic*', 1, 7, 'italic'],
  ['~~', '~~strike~~', 2, 8, 'strike'],
  ['`', '`code`', 1, 5, 'code'],
  ['**', 'hello', 0, 5, '**hello**'],
  ['**', ' hello ', 0, 7, ' **hello** '],
  ['**', 'a **b** c', 0, 9, '**a b c**'],
  ['**', '**one two three**', 6, 9, '**one** two **three**'],
  ['**', '***bold***', 3, 7, '*bold*'],
  ['*', '**bold**', 2, 6, '***bold***'],
  ['`', 'x`y', 0, 3, '``x`y``'],
  ['**', '****', 2, 2, '']
] as [MarkdownInlineFormat, string, number, number, string][])(
  'toggles %s in %s without nesting duplicate markers',
  (format, text, from, to, expected) => {
    const target = editor(text, from, to)
    expect(toggleMarkdownInline(format)(target)).toBe(true)
    expect(target.state.doc.toString()).toBe(expected)
  }
)

it('does not insert formatting markers into a fenced code block', () => {
  const target = editor('```\nconst x = 1\n```', 10)
  expect(toggleMarkdownInline('**')(target)).toBe(false)
  expect(target.state.doc.toString()).toBe('```\nconst x = 1\n```')
})

it('retains selection on the formatted text and removes the same formatting again', () => {
  const target = editor('中文 text', 0, 2)
  toggleMarkdownInline('**')(target)
  expect(
    target.state.sliceDoc(target.state.selection.main.from, target.state.selection.main.to)
  ).toBe('中文')
  toggleMarkdownInline('**')(target)
  expect(target.state.doc.toString()).toBe('中文 text')
})

it('clears only the selected word while retaining formatting around its neighbors', () => {
  const target = editor('**one two three**', 6, 9)
  expect(clearMarkdownInlineFormat(target)).toBe(true)
  expect(target.state.doc.toString()).toBe('**one** two **three**')
  expect(
    target.state.sliceDoc(target.state.selection.main.from, target.state.selection.main.to)
  ).toBe('two')
})

it('clears multiple independent and nested styles inside a selection', () => {
  const source = '**one** and ***two***'
  const target = editor(source, 0, source.length)
  expect(clearMarkdownInlineFormat(target)).toBe(true)
  expect(target.state.doc.toString()).toBe('one and two')
})
