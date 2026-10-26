import { expect, it } from 'vitest'
import type { Transaction } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { removeListMarker, completeCodeFence } from './editor-commands'

function target(text: string, anchor = text.length) {
  let state = EditorState.create({
    doc: text,
    selection: { anchor },
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

it('turns an empty bullet into a continuation paragraph of the preceding item', () => {
  const editor = target('- first\n- ')
  expect(removeListMarker(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe('- first\n\n  ')
  expect(editor.state.selection.main.head).toBe(11)
})

it('removes the marker but preserves the current item text', () => {
  const editor = target('- first\n- second', 10)
  expect(removeListMarker(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe('- first\nsecond')
})

it('removes heading formatting at the start of a heading without deleting its text', () => {
  const editor = target('## 标题', 3)
  expect(removeListMarker(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe('标题')
})

it('never treats code content as a list marker', () => {
  const editor = target('```\n- test\n```', 6)
  expect(removeListMarker(editor)).toBe(false)
})

it('completes a typed fence with a closing fence and puts the cursor inside', () => {
  const editor = target('```typescript')
  expect(completeCodeFence(editor)).toBe(true)
  expect(editor.state.doc.toString()).toBe('```typescript\n\n```')
  expect(editor.state.selection.main.head).toBe(14)
})
