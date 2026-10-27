import { expect, it } from 'vitest'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import {
  markdown,
  markdownLanguage,
  insertNewlineContinueMarkupCommand
} from '@codemirror/lang-markdown'
import { markdownDocumentModel, readMarkdownDocumentTree } from './markdown-document-model'
import { markdownListDeletionNumbering } from './markdown-list-numbering'
import { markdownListMarkerWidth } from './markdown-list-marker-width'
import { markdownEditorMode } from './editor-context'
import {
  markdownSourceExtensions,
  markdownSourceField,
  createSourceDocument
} from './source-document'

function target(raw: string, mode: 'live' | 'source' = 'live') {
  let state = EditorState.create({
    doc: createSourceDocument(raw).text,
    selection: { anchor: 8 },
    extensions: [
      history(),
      markdown({ base: markdownLanguage }),
      markdownDocumentModel,
      markdownListMarkerWidth,
      markdownListDeletionNumbering,
      markdownEditorMode.of(mode),
      markdownSourceExtensions(raw)
    ]
  })
  return {
    get state() {
      return state
    },
    get raw() {
      return state.field(markdownSourceField).raw
    },
    dispatch(t: Transaction) {
      state = t.state
    }
  }
}

it.each([
  [
    '8. alpha\n9. bravo\n   ```text\n   x\n   ```\n10. next',
    '8. alpha\n9. \n10. bravo\n    ```text\n    x\n    ```\n11. next'
  ],
  [
    '98. alpha\n99. bravo\n    ```text\n    x\n    ```\n100. next',
    '98. alpha\n99. \n100. bravo\n     ```text\n     x\n     ```\n101. next'
  ],
  [
    '8. alpha\n9. bravo\n   1. child\n      ```\n      x\n      ```',
    '8. alpha\n9. \n10. bravo\n    1. child\n       ```\n       x\n       ```'
  ],
  [
    '8. alpha\n9. bravo\nlazy text\n   ```\n   x\n   ```',
    '8. alpha\n9. \n10. bravo\nlazy text\n    ```\n    x\n    ```'
  ]
])('retains descendant ownership when numbering grows in %j', (source, expected) => {
  const editor = target(source)
  editor.dispatch(editor.state.update({ selection: { anchor: source.indexOf('\n') } }))
  expect(insertNewlineContinueMarkupCommand({ nonTightLists: false })(editor)).toBe(true)
  expect(editor.raw).toBe(expected)
  let owned = false
  readMarkdownDocumentTree(editor.state).iterate({
    enter(n) {
      if (n.name === 'FencedCode') {
        let parent = n.node.parent
        while (parent) {
          if (parent.name === 'ListItem') {
            owned = true
          }
          parent = parent.parent
        }
      }
    }
  })
  expect(owned).toBe(true)
  expect(undo(editor)).toBe(true)
  expect(editor.raw).toBe(source)
  expect(redo(editor)).toBe(true)
  expect(editor.raw).toBe(expected)
})

it('resizes descendants after deletion renumbering and restores mixed line endings exactly', () => {
  const source =
    'Before ->\r\n\r\n8. alpha\r\n9. removed\r\n10. bravo\r\n    ```\r\n    x\r\n    ```\r\n\r\nAfter &gt;\n'
  const editor = target(source)
  const from = editor.state.doc.toString().indexOf('9. removed')
  editor.dispatch(
    editor.state.update({
      changes: { from, to: from + '9. removed\n'.length },
      userEvent: 'delete.selection'
    })
  )
  expect(editor.raw).toBe(
    source
      .replace('9. removed\r\n', '')
      .replace('10. bravo', '9. bravo')
      .replaceAll('\r\n    ', '\r\n   ')
  )
  undo(editor)
  expect(editor.raw).toBe(source)
})

it('preserves tab-aligned content when a longer marker occupies the same columns', () => {
  const source = '8. alpha\n9.\tbravo\n    ```\n    x\n    ```'
  const editor = target(source)
  insertNewlineContinueMarkupCommand({ nonTightLists: false })(editor)
  expect(editor.raw).toBe('8. alpha\n9. \n10.\tbravo\n    ```\n    x\n    ```')
})

it('keeps source mode and external reloads literal', () => {
  const source = '8. alpha\n9. bravo\n   ```\n   x\n   ```'
  for (const [mode, userEvent] of [
    ['source', 'input.type'],
    ['live', 'external.reload']
  ] as const) {
    const editor = target(source, mode)
    const from = source.indexOf('9.')
    editor.dispatch(
      editor.state.update({ changes: { from, to: from + 1, insert: '10' }, userEvent })
    )
    expect(editor.raw).toBe(source.replace('9.', '10.'))
  }
})
