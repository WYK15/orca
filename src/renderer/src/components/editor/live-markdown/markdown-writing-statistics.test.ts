import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { markdownDocumentSyntax } from './markdown-document-syntax'
import { markdownWritingStatistics } from './markdown-writing-statistics'
import { markdownAssetDirectory, markdownAssetReference } from './markdown-asset-directory'
import { validMarkdownImageFolder } from './markdown-writing-preferences'

it('counts Chinese characters and English words while excluding metadata and Markdown destinations', () => {
  const state = EditorState.create({
    doc: '---\ntitle: metadata\n---\n\n# 中文hello世界\n\n[one two](https://example.com/path) **three**',
    extensions: [markdown({ base: markdownLanguage, extensions: markdownDocumentSyntax })]
  })
  expect(markdownWritingStatistics(state).words).toBe(8)
  const from = state.doc.toString().indexOf('one two')
  expect(markdownWritingStatistics(state, from, from + 7).words).toBe(2)
})
it.each(['/tmp/notes/manual.md', 'C:\\Work\\notes\\manual.md'])(
  'resolves document-relative asset directories on the file owner platform: %s',
  (file) => {
    const directory = markdownAssetDirectory(file, '{filename}.assets/pics')
    const separator = file.includes('\\') ? '\\' : '/'
    expect(directory).toBe(
      `${file.slice(0, file.lastIndexOf(separator) + 1)}manual.assets${separator}pics`
    )
    expect(markdownAssetReference(file, `${directory}${separator}image #1.png`)).toBe(
      'manual.assets/pics/image%20%231.png'
    )
  }
)
it.each(['../outside', '/absolute', 'C:\\absolute', 'assets/../../other', 'assets\nother'])(
  'rejects an asset path outside the document directory: %s',
  (folder) => {
    expect(validMarkdownImageFolder(folder)).toBe(false)
    expect(() => markdownAssetDirectory('/tmp/doc.md', folder)).toThrow()
  }
)
