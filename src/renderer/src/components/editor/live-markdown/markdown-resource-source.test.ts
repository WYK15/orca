// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { history, undo } from '@codemirror/commands'
import { markdownDocumentSyntax } from './markdown-document-syntax'
import {
  markdownSourceExtensions,
  markdownSourceField,
  createSourceDocument
} from './source-document'
import {
  readMarkdownResource,
  resourceEditTransaction,
  resourceSource
} from './markdown-resource-source'

function state(source: string) {
  return EditorState.create({
    doc: createSourceDocument(source).text,
    extensions: [
      markdown({ base: markdownLanguage, extensions: markdownDocumentSyntax }),
      markdownSourceExtensions(source),
      history()
    ]
  })
}
it('edits only the selected link destination and retains untouched quote styles and entities', () => {
  const source = "Before ->\r\n\r\n[label](<a b> 'title')\n\nAfter &gt;"
  let current = state(source)
  const resource = readMarkdownResource(current, 15)!
  expect(resource.href).toBe('a b')
  current = current.update(
    resourceEditTransaction(current, resource, { ...resource, href: 'next path.md#anchor' })!
  ).state
  expect(current.field(markdownSourceField).raw).toBe(
    source.replace('<a b>', 'next%20path.md#anchor')
  )
  expect(
    undo({
      state: current,
      dispatch: (transaction) => {
        current = transaction.state
      }
    })
  ).toBe(true)
  expect(current.field(markdownSourceField).raw).toBe(source)
})
it('recognizes both edges of links and images', () => {
  for (const source of ['[link](target)', '![alt](image.png)']) {
    const editor = state(source)
    expect(readMarkdownResource(editor, 0)?.source).toBe(source)
    expect(readMarkdownResource(editor, source.length)?.source).toBe(source)
  }
})
it('updates a reference occurrence without rewriting shared definitions or other occurrences', () => {
  const source = '[one][id] and [two][id]\n\n[id]: original "title"'
  const editor = state(source)
  const resource = readMarkdownResource(editor, 2)!
  const next = editor.update(
    resourceEditTransaction(editor, resource, { ...resource, href: 'changed' })!
  ).state
  expect(next.doc.toString()).toBe('[one](changed "title") and [two][id]\n\n[id]: original "title"')
})
it('adds dimensions deliberately as HTML and preserves unrelated HTML attributes during later edits', () => {
  const editor = state('![privacy](pic.png)')
  const resource = readMarkdownResource(editor, 4)!
  expect(resourceSource(resource, { ...resource, width: '240' })).toBe(
    '<img src="pic.png" alt="privacy" width="240">'
  )
  const html = '<img class="original" src=\'pic.png\' alt=\'old\' width="240" style="zoom:50%">'
  const image = readMarkdownResource(state(html), 1)!
  expect(resourceSource(image, { ...image, label: 'a "quote"' })).toBe(
    html.replace("alt='old'", 'alt="a &quot;quote&quot;"')
  )
})
it('preserves byte-identical inline markup when nothing changed and safely escapes edited labels and paths', () => {
  const resource = readMarkdownResource(state('![alt](<a b.png>  "caption")'), 3)!
  expect(resourceSource(resource, resource)).toBe(resource.source)
  expect(resourceSource(resource, { ...resource, label: '[x]', href: 'a(b)%20.png' })).toBe(
    '![\\[x\\]](a%28b%29%20.png  "caption")'
  )
})
it('rejects stale resource edits instead of overwriting later document changes', () => {
  const original = state('[label](old)')
  const resource = readMarkdownResource(original, 2)!
  const changed = original.update({ changes: { from: 8, to: 11, insert: 'new' } }).state
  expect(resourceEditTransaction(changed, resource, { ...resource, href: 'other' })).toBeNull()
})
it('does not dirty the document or add undo history when applying unchanged resource fields', () => {
  let current = state('[label](old)')
  current = current.update({
    changes: { from: current.doc.length, insert: 'x' },
    userEvent: 'input.type'
  }).state
  const resource = readMarkdownResource(current, 2)!
  const applied = current.update(resourceEditTransaction(current, resource, resource)!)
  expect(applied.docChanged).toBe(false)
  current = applied.state
  undo({
    state: current,
    dispatch: (transaction) => {
      current = transaction.state
    }
  })
  expect(current.doc.toString()).toBe('[label](old)')
})
