import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { markdownDocumentSyntax } from './markdown-document-syntax'
import { markdownDocumentModel, readMarkdownDocument } from './markdown-document-model'

function documentState(source: string) {
  return EditorState.create({
    doc: source,
    extensions: [
      markdown({ base: markdownLanguage, extensions: markdownDocumentSyntax }),
      markdownDocumentModel
    ]
  })
}
function nodes(source: string, name: string): string[] {
  const state = documentState(source)
  const matches: string[] = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === name) {
        matches.push(state.sliceDoc(node.from, node.to))
      }
    }
  })
  return matches
}

it.each([
  '---\ntitle: Example\n---',
  '\ufeff---\ntitle: Example\n---',
  '---\ntitle: Example\n...',
  '---\n---'
])('recognizes a closed front-matter block without consuming the body: %s', (header) => {
  const source = `${header}\n# Body`
  expect(nodes(source, 'FrontMatter')).toEqual([header])
  expect(
    readMarkdownDocument(documentState(source)).headings.map((heading) => heading.title)
  ).toEqual(['Body'])
})

it('retains normal Markdown for unclosed or misplaced front matter', () => {
  expect(nodes('---\n# body', 'FrontMatter')).toEqual([])
  expect(nodes('before\n\n---\ntitle: example\n---', 'FrontMatter')).toEqual([])
})

it('keeps independent documents and reparsed front matter isolated', () => {
  const first = documentState('---\ntitle: One\n---\n# One')
  const other = documentState('---\n# ordinary rule')
  expect(syntaxTree(first).toString()).toContain('FrontMatter')
  expect(syntaxTree(other).toString()).not.toContain('FrontMatter')
  const changed = first.update({ changes: { from: 4, to: 14, insert: 'title: Changed' } }).state
  expect(readMarkdownDocument(changed).headings[0].title).toBe('One')
  const unclosed = first.update({ changes: { from: 15, to: 18 } }).state
  expect(syntaxTree(unclosed).toString()).not.toContain('FrontMatter')
  const restored = unclosed.update({ changes: { from: 15, insert: '---' } }).state
  expect(syntaxTree(restored).toString()).toContain('FrontMatter')
})

it('parses inline and multiline display formulas without treating code or currency as formulas', () => {
  const source =
    'Text $x^2$ and $x + y$.\n\n$$\nx + y\n\nz\n$$\n\n`$code$`\n\n```\n$code$\n```\n\nCosts $10 and $20. Escaped \\$x$.'
  expect(nodes(source, 'InlineMath')).toEqual(['$x^2$', '$x + y$'])
  expect(nodes(source, 'DisplayMath')).toEqual(['$$\nx + y\n\nz\n$$'])
  expect(nodes('$$x^2$$', 'DisplayMath')).toEqual(['$$x^2$$'])
})

it('keeps math and footnote-like text inside metadata opaque', () => {
  const source = '---\ntitle: "$x$ and [^note]"\n---\n\nbody'
  expect(nodes(source, 'InlineMath')).toEqual([])
  expect(nodes(source, 'FootnoteReference')).toEqual([])
})

it('numbers defined footnotes by first reference and retains repeated-reference targets', () => {
  const source =
    'Second[^B], first[^a], second again[^b], unknown[^missing].\n\n[^a]: first\n\n[^b]: second\n    continued\n\n    another paragraph\n\n# Body'
  const model = readMarkdownDocument(documentState(source))
  expect(model.notes.map((note) => [note.id, note.number, note.body])).toEqual([
    ['b', 1, 'second\ncontinued\n\nanother paragraph'],
    ['a', 2, 'first']
  ])
  expect(model.notes[0].references).toHaveLength(2)
  expect(model.references.size).toBe(3)
  expect(model.headings.map((heading) => heading.title)).toEqual(['Body'])
})

it('keeps code, escaped references and duplicate definitions out of note numbering', () => {
  const source =
    '\\[^x] and `[^x]`\n\n```\n[^x]\n```\n\nText[^x]\n\n[^x]: original\n[^x]: duplicate'
  const model = readMarkdownDocument(documentState(source))
  expect(model.notes).toHaveLength(1)
  expect(model.notes[0].body).toBe('original')
  expect(model.notes[0].references).toHaveLength(1)
})

it('recognizes TOC placeholders and six heading levels while excluding metadata, notes and code', () => {
  const source =
    '---\ntitle: metadata\n---\n\n[TOC]\n\n# Repeat\n\n###### Repeat\n\n[^x]: # Not a heading\n\n```\n# Not a heading\n[toc]\n```'
  expect(nodes(source, 'DocumentToc')).toEqual(['[TOC]'])
  expect(
    readMarkdownDocument(documentState(source)).headings.map((heading) => [
      heading.id,
      heading.level
    ])
  ).toEqual([
    ['repeat', 1],
    ['repeat-1', 6]
  ])
})

it('recognizes complete nested inline HTML but leaves unclosed tags and code editable', () => {
  const source = 'H<sub>2</sub>O <span><b>bold</b></span> <span>not closed\n\n`<sup>literal</sup>`'
  expect(nodes(source, 'InlineHtml')).toEqual(['<sub>2</sub>', '<span><b>bold</b></span>'])
})
