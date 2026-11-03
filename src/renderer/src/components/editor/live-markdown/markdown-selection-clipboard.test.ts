// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state'
import { expect, it } from 'vitest'
import { marked } from 'marked'
import { markdownEditorExtensions } from './editor-extensions'
import { projectMarkdownSelection } from './markdown-selection-clipboard'

function clipboard(state: EditorState) {
  const projected = projectMarkdownSelection(state)
  return { plain: projected.plain, html: marked.parse(projected.markdown, { async: false }) }
}

const cases = [
  ['complete bold', 'before **bold words** after', 'bold words', '**bold words**', 'strong'],
  ['partial bold', 'before **bold words** after', 'old wor', 'old wor', 'strong'],
  ['partial italic', 'before *italic words* after', 'talic wor', 'talic wor', 'em'],
  ['partial strike', 'before ~~deleted words~~ after', 'leted wor', 'leted wor', 'del'],
  ['nested format', '**bold *nested words* end**', 'sted wor', 'sted wor', 'em'],
  ['leaving bold', '**bold words** after', 'words** after', 'words after', 'strong'],
  ['entering bold', 'before **bold words**', 'before **bold', 'before bold', 'strong'],
  [
    'complete code',
    'before `sampleQueryStatus` after',
    'sampleQueryStatus',
    '`sampleQueryStatus`',
    'code'
  ],
  [
    'partial code',
    'before `*literal* &amp; <tag>` after',
    'literal* &amp;',
    'literal* &amp;',
    'code'
  ],
  ['list code boundary', '- `listCodeAlpha`', '`listCodeAlpha', 'listCodeAlpha', 'code'],
  ['link label', '[Link label](https://example.invalid/path)', 'Link label', 'Link label', 'a'],
  ['partial link', '[Link label](https://example.invalid/path)', 'ink lab', 'ink lab', 'a'],
  ['paragraph spacing', 'first tail\n\nsecond head', 'tail\n\nsecond', 'tail\n\nsecond', 'p'],
  ['list items', '- alpha\n- beta\n- gamma', 'alpha\n- beta', 'alpha\nbeta', 'li'],
  ['whole list', '- alpha\n- beta', '- alpha\n- beta', '- alpha\n- beta', 'li'],
  ['whole heading', '## Heading words', '## Heading words', '## Heading words', 'h2'],
  ['empty code block', '```text\n\n```', '```text\n\n```', '```text\n\n```', 'code']
]

it.each(cases)(
  'copies %s in document context in either direction',
  (_name, body, selected, plain, tag) => {
    const source = `# Clipboard\n\n${body}\n\nend`
    const from = source.indexOf(selected)
    for (const reverse of [false, true]) {
      const state = EditorState.create({
        doc: source,
        selection: {
          anchor: reverse ? from + selected.length : from,
          head: reverse ? from : from + selected.length
        },
        extensions: markdownEditorExtensions()
      })
      const result = clipboard(state)
      expect(result.plain).toBe(plain)
      expect(result.html).toMatch(new RegExp(`<${tag}(?:>|\\s)`))
      expect(result.html).not.toContain('# Clipboard')
      expect(state.doc.toString()).toBe(source)
    }
  }
)

it('copies a complete document as Markdown alongside sanitized rich content', () => {
  const source = '# Title\n\n**bold** and `code`\n\n- one\n- two\n\n![image](./local.png)'
  const state = EditorState.create({
    doc: source,
    selection: { anchor: 0, head: source.length },
    extensions: markdownEditorExtensions()
  })
  const result = clipboard(state)
  expect(result.plain).toBe(source)
  expect(result.html).toContain('<strong>bold</strong>')
  expect(result.html).toContain('<img')
})

it('keeps HTML-looking code literal in the rich clipboard projection', () => {
  const source = 'Before `<img src=x onerror=alert(1)>` after'
  const from = source.indexOf('<img'),
    to = source.lastIndexOf(' after')
  const state = EditorState.create({
    doc: source,
    selection: { anchor: from, head: to },
    extensions: markdownEditorExtensions()
  })
  const result = clipboard(state)
  expect(result.html).toContain('&lt;img')
  expect(result.html).not.toContain('<img')
})
