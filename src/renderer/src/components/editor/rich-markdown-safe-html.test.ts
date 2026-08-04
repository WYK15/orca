// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { encodeRawMarkdownHtmlForRichEditor } from './raw-markdown-html'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'

const SAFE_INLINE_NODE = 'richMarkdownSafeHtmlInline'
const SAFE_BLOCK_NODE = 'richMarkdownSafeHtmlBlock'

function createMarkdownEditor(markdown: string): Editor {
  const codec = createRichMarkdownEditorCodec()
  return new Editor({
    element: null,
    extensions: createRichMarkdownExtensions({ codec }),
    content: encodeRawMarkdownHtmlForRichEditor(markdown, codec),
    contentType: 'markdown'
  })
}

function createHtmlEditor(html: string, codec = createRichMarkdownEditorCodec()): Editor {
  return new Editor({
    element: null,
    extensions: createRichMarkdownExtensions({ codec }),
    content: html
  })
}

function nodeNames(editor: Editor): string[] {
  const names: string[] = []
  editor.state.doc.descendants((node) => {
    names.push(node.type.name)
  })
  return names
}

describe('rich Markdown safe HTML extensions', () => {
  it('creates safe inline and block atoms instead of raw HTML atoms', () => {
    const editor = createMarkdownEditor(
      'Before <span style="color: red">safe</span> after\n\n<p>Block<br>tail</p>'
    )
    try {
      expect(nodeNames(editor)).toContain(SAFE_INLINE_NODE)
      expect(nodeNames(editor)).toContain(SAFE_BLOCK_NODE)
      expect(nodeNames(editor)).not.toContain('rawMarkdownHtmlInline')
      expect(nodeNames(editor)).not.toContain('rawMarkdownHtmlBlock')
    } finally {
      editor.destroy()
    }
  })

  it.each([
    'Before <A HREF="./Guide.md" TITLE="A &amp; B">Guide</A> after',
    '<span style="color:#fff; font-weight:700">Text &copy;</span>',
    'First<br>Second<br/>Third<br />Fourth',
    '<h1 style="background-color: rgb(1 2 3)">Title</h1>',
    '<p>Alpha\n<span>Beta</span>\nGamma</p>'
  ])('round trips exact safe source: %s', (markdown) => {
    const editor = createMarkdownEditor(markdown)
    try {
      expect(editor.getMarkdown()).toBe(markdown)
    } finally {
      editor.destroy()
    }
  })

  it('rejects a forged safe transport payload', () => {
    const codec = createRichMarkdownEditorCodec()
    const forged = codec.transport.create('safe-inline-html', '<span onclick="go()">unsafe</span>')
    const editor = new Editor({
      element: null,
      extensions: createRichMarkdownExtensions({ codec }),
      content: forged,
      contentType: 'markdown'
    })
    try {
      expect(nodeNames(editor)).not.toContain(SAFE_INLINE_NODE)
    } finally {
      editor.destroy()
    }
  })

  it('emits a versioned clipboard projection with exact source', () => {
    const source = '<span><u>safe</u></span>'
    const editor = createMarkdownEditor(source)
    try {
      const html = editor.getHTML()
      expect(html).toContain('data-rich-markdown-safe-html-inline="1"')
      expect(html).toContain('data-orca-safe-html-source="<span><u>safe</u></span>"')
      expect(html).toContain('<u>safe</u>')
    } finally {
      editor.destroy()
    }
  })

  it('recreates a safe atom from a valid internal clipboard projection', () => {
    const sourceEditor = createMarkdownEditor('<span><u>safe</u></span>')
    const codec = createRichMarkdownEditorCodec()
    let pasted: Editor | null = null
    try {
      pasted = createHtmlEditor(sourceEditor.getHTML(), codec)
      expect(nodeNames(pasted)).toContain(SAFE_INLINE_NODE)
      expect(pasted.getMarkdown()).toBe('<span><u>safe</u></span>')
    } finally {
      sourceEditor.destroy()
      pasted?.destroy()
    }
  })

  it.each([
    '<span data-rich-markdown-safe-html-inline="2" data-orca-safe-html-source="&lt;span&gt;safe&lt;/span&gt;">safe</span>',
    '<span data-rich-markdown-safe-html-inline="1" data-orca-safe-html-source="&lt;span onclick=&quot;go()&quot;&gt;safe&lt;/span&gt;">safe</span>',
    '<span data-rich-markdown-safe-html-inline="1" data-orca-safe-html-source="&lt;span&gt;safe&lt;/span&gt;">changed</span>',
    '<span data-rich-markdown-safe-html-inline="1" data-orca-safe-html-source="&lt;span&gt;safe&lt;/span&gt;" class="forged">safe</span>'
  ])('rejects forged internal clipboard HTML', (html) => {
    const editor = createHtmlEditor(html)
    try {
      expect(nodeNames(editor)).not.toContain(SAFE_INLINE_NODE)
    } finally {
      editor.destroy()
    }
  })
})
