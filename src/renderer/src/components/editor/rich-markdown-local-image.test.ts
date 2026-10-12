// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'
import { resetLocalImageSrcStateForTests } from './useLocalImageSrc'
import { setRichMarkdownImageResolverContext } from './rich-markdown-image-context'
import { createRichMarkdownHtmlSuperscriptLinkContext } from './rich-markdown-html-superscript-link-context'
import { serializeRichMarkdownForReconcile } from './rich-markdown-reconcile-serializer'
import { reconcileSerializedMarkdown } from './rich-markdown-source-reconcile'

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('rich markdown local images', () => {
  beforeEach(() => {
    resetLocalImageSrcStateForTests()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rich-local-image')
    globalThis.window.api = {
      ...globalThis.window.api,
      fs: {
        readFile: vi.fn().mockResolvedValue({
          content: 'AA==',
          isBinary: true,
          mimeType: 'image/png'
        })
      }
    } as unknown as Window['api']
  })

  afterEach(() => {
    resetLocalImageSrcStateForTests()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reloads persisted relative images after the markdown file context is assigned', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor({
      element: host,
      extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
      content: '![](diagram.png)',
      contentType: 'markdown'
    })

    try {
      const img = host.querySelector('img')
      expect(img).not.toBeNull()
      expect(window.api.fs.readFile).not.toHaveBeenCalled()

      setRichMarkdownImageResolverContext(editor, { filePath: '/repo/docs/readme.md' })

      await flushPromises()

      expect(window.api.fs.readFile).toHaveBeenCalledWith({
        filePath: '/repo/docs/diagram.png',
        connectionId: undefined
      })
      expect(host.querySelector('img')?.src).toBe('blob:rich-local-image')
    } finally {
      editor.destroy()
    }
  })
  it('renders a relative image inside an ordered list nested in a bullet list', async () => {
    const host = document.createElement('div')
    const codec = createRichMarkdownEditorCodec()
    const source = [
      '- Property List',
      '',
      '  1. Select PrivacyInfo.xcprivacy',
      '',
      '  2. Configure `Privacy Nutrition Label Types`:',
      '',
      '     ![privacy](./res/privacy.png)',
      '',
      '- Source Code'
    ].join('\n')
    const editor = new Editor({
      element: host,
      extensions: createRichMarkdownExtensions({ codec }),
      content: source,
      contentType: 'markdown',
      onBeforeCreate: ({ editor: live }) => {
        setRichMarkdownImageResolverContext(live, { filePath: '/repo/iOS/guide.md' })
      }
    })
    try {
      await flushPromises()
      expect(host.querySelector('li li img')).not.toBeNull()
      expect(window.api.fs.readFile).toHaveBeenCalledWith({
        filePath: '/repo/iOS/res/privacy.png',
        connectionId: undefined
      })
      expect(host.querySelector('img')?.src).toBe('blob:rich-local-image')
      editor.view.dispatch(editor.state.tr.setSelection(editor.state.selection))
      const baseCanonical = editor.getMarkdown()
      expect(baseCanonical).toContain('![privacy](./res/privacy.png)')
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text === 'Property List') {
          editor.commands.insertContentAt({ from: pos, to: pos + node.nodeSize }, 'Updated List')
          return false
        }
        return true
      })
      const roundTrip = (text: string): string | null =>
        serializeRichMarkdownForReconcile(text, {
          htmlSuperscriptLinkContext: createRichMarkdownHtmlSuperscriptLinkContext({
            sourceFilePath: '/repo/iOS/guide.md',
            worktreeId: '',
            worktreeRoot: null,
            sourceOwner: { kind: 'unknown' }
          }),
          imageResolverContext: { filePath: '/repo/iOS/guide.md' }
        })
      expect(
        reconcileSerializedMarkdown({
          originalSource: source,
          baseCanonical,
          edited: editor.getMarkdown(),
          roundTrip
        })
      ).toBe(source.replace('Property List', 'Updated List'))
    } finally {
      editor.destroy()
    }
  })
})
