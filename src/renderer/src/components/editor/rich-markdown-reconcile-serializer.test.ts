// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { expect, it } from 'vitest'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownHtmlSuperscriptLinkContext } from './rich-markdown-html-superscript-link-context'
import { normalizeEmptyListItems } from './rich-markdown-normalize'
import { serializeRichMarkdownForReconcile } from './rich-markdown-reconcile-serializer'
import { reconcileSerializedMarkdown } from './rich-markdown-source-reconcile'

it.each(['section', 'paragraph text', 'list text'])(
  'source-preserves a live %s deletion when the document ends with a code block',
  async (operation) => {
    const source = [
      '# Guide',
      '',
      '### 1.3 HTTP',
      '',
      '旧版本需要配置 HTTP 请求。',
      '',
      '1. Configure HTTP',
      '2. Enable requests',
      '',
      '### 1.4 Privacy',
      '',
      '_Keep_ -> source',
      '',
      '```xml',
      '<key>YES</key>',
      '```',
      ''
    ].join('\n')
    const context = {
      htmlSuperscriptLinkContext: createRichMarkdownHtmlSuperscriptLinkContext({
        sourceFilePath: '',
        worktreeId: '',
        worktreeRoot: null,
        sourceOwner: { kind: 'unknown' }
      }),
      imageResolverContext: { filePath: '' }
    }
    const serialize = (text: string): string | null =>
      serializeRichMarkdownForReconcile(text, context)
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: createRichMarkdownExtensions({
        codec: createRichMarkdownEditorCodec(),
        htmlSuperscriptLinks: true,
        htmlSuperscriptLinkContext: context.htmlSuperscriptLinkContext
      }),
      content: source,
      contentType: 'markdown',
      onCreate: ({ editor: live }) => normalizeEmptyListItems(live)
    })
    try {
      await new Promise<void>((resolve) => editor.on('create', () => resolve()))
      editor.view.dispatch(editor.state.tr.setSelection(editor.state.selection))
      const baseCanonical = editor.getMarkdown()
      expect(baseCanonical).toBe(serialize(source))
      expect(editor.state.doc.lastChild?.type.name).toBe('paragraph')
      let from = -1,
        to = -1
      editor.state.doc.forEach((node, pos) => {
        if (node.type.name === 'heading' && node.textContent === '1.3 HTTP') {
          from = pos
        }
        if (node.type.name === 'heading' && node.textContent === '1.4 Privacy') {
          to = pos
        }
      })
      let expected = source.replace(/### 1\.3[\s\S]*?(?=### 1\.4)/, '')
      if (operation !== 'section') {
        const line =
          operation === 'paragraph text' ? '旧版本需要配置 HTTP 请求。' : 'Configure HTTP'
        const removed = operation === 'paragraph text' ? '需要配置' : 'fig'
        editor.state.doc.descendants((node, pos) => {
          if (node.isText && node.text === line) {
            from = pos + line.indexOf(removed)
            to = from + removed.length
          }
        })
        expected = source.replace(line, line.replace(removed, ''))
      }
      expect(from).toBeGreaterThan(0)
      expect(to).toBeGreaterThan(from)
      editor.commands.deleteRange({ from, to })
      const edited = editor.getMarkdown()
      const reconciled = reconcileSerializedMarkdown({
        originalSource: source,
        baseCanonical,
        edited,
        roundTrip: serialize
      })
      expect(reconciled).toBe(expected)
      expect(serialize(reconciled)).toBe(edited)
    } finally {
      editor.destroy()
    }
  }
)
