// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import { useRichMarkdownProgrammaticSync } from './useRichMarkdownProgrammaticSync'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import {
  createRichMarkdownEditorCodec,
  type RichMarkdownEditorCodec
} from './rich-markdown-source-transport'
import {
  createRichMarkdownHtmlSuperscriptLinkContext,
  type RichMarkdownHtmlSuperscriptLinkContext
} from './rich-markdown-html-superscript-link-context'
import { encodeRawMarkdownHtmlForRichEditor } from './raw-markdown-html'

function buildEditor(
  codec: RichMarkdownEditorCodec,
  htmlSuperscriptLinkContext: RichMarkdownHtmlSuperscriptLinkContext,
  markdown: string
): Editor {
  return new Editor({
    element: null,
    extensions: createRichMarkdownExtensions({
      codec,
      htmlSuperscriptLinks: true,
      htmlSuperscriptLinkContext
    }),
    content: encodeRawMarkdownHtmlForRichEditor(markdown, codec, { htmlSuperscriptLinks: true }),
    contentType: 'markdown'
  })
}

function nodeNames(editor: Editor): string[] {
  const names: string[] = []
  editor.state.doc.descendants((node) => {
    names.push(node.type.name)
  })
  return names
}

describe('useRichMarkdownProgrammaticSync external-reload baseline adoption (#6080)', () => {
  it('adopts externally-canonicalized bytes as the reconciliation baseline without a reload', () => {
    const codec = createRichMarkdownEditorCodec()
    const htmlSuperscriptLinkContext = createRichMarkdownHtmlSuperscriptLinkContext({
      sourceFilePath: '',
      worktreeId: '',
      worktreeRoot: null,
      sourceOwner: { kind: 'unknown' as const }
    })
    // The editor currently shows emphasis loaded from the original `_old_` source;
    // its canonical (getMarkdown) form is `*old*` with no trailing newline.
    const canonical = '# T\n\n*old*'
    const editor = buildEditor(codec, htmlSuperscriptLinkContext, canonical)
    expect(editor.getMarkdown()).toBe(canonical)

    // Refs still reflect the ORIGINAL non-canonical source bytes on disk.
    const lastCommittedMarkdownRef = { current: '# T\n\n_old_' }
    const originalSourceRef = { current: '# T\n\n_old_' }
    const baseCanonicalRef = { current: canonical }
    const isApplyingProgrammaticUpdateRef = { current: false }

    try {
      // An external tool rewrites disk to the canonical bytes (same semantics,
      // new byte-level style). The doc already renders them, so no reload — but
      // the reconciliation baseline must still be refreshed to the new bytes.
      renderHook(() =>
        useRichMarkdownProgrammaticSync({
          codec,
          content: canonical,
          docLinkMenuSetter: vi.fn(),
          editor,
          fileId: 'f1',
          filePath: '/repo/README.md',
          isApplyingProgrammaticUpdateRef,
          lastCommittedMarkdownRef,
          originalSourceRef,
          baseCanonicalRef,
          markdownDocuments: undefined,
          rootRef: { current: null },
          runtimeEnvironmentId: null,
          settings: null,
          slashMenuSetter: vi.fn(),
          worktreeId: 'w1',
          worktreeRoot: null
        })
      )

      // Without the fix these stay stale at `_old_`, and the next edit would
      // rewrite the file back to `_old_`, silently undoing the external change.
      expect(lastCommittedMarkdownRef.current).toBe(canonical)
      expect(originalSourceRef.current).toBe(canonical)
      expect(baseCanonicalRef.current).toBe(canonical)
    } finally {
      editor.destroy()
    }
  })

  it('rebuilds safe block HTML and preserves unsupported external HTML losslessly', () => {
    const codec = createRichMarkdownEditorCodec()
    const htmlSuperscriptLinkContext = createRichMarkdownHtmlSuperscriptLinkContext({
      sourceFilePath: '/repo/README.md',
      worktreeId: 'w1',
      worktreeRoot: '/repo',
      sourceOwner: { kind: 'local' as const }
    })
    const initial = '<span>old</span>'
    const safeBlock = '<p>Alpha\n<span>Beta</span>\nGamma</p>'
    const unsafe = '<iframe src="https://example.com">fallback</iframe>'
    const editor = buildEditor(codec, htmlSuperscriptLinkContext, initial)
    const lastCommittedMarkdownRef = { current: initial }
    const originalSourceRef = { current: initial }
    const baseCanonicalRef = { current: initial }
    const isApplyingProgrammaticUpdateRef = { current: false }
    const hook = renderHook(
      ({ content }) =>
        useRichMarkdownProgrammaticSync({
          codec,
          content,
          docLinkMenuSetter: vi.fn(),
          editor,
          fileId: 'f1',
          filePath: '/repo/README.md',
          isApplyingProgrammaticUpdateRef,
          lastCommittedMarkdownRef,
          originalSourceRef,
          baseCanonicalRef,
          markdownDocuments: undefined,
          rootRef: { current: null },
          runtimeEnvironmentId: null,
          settings: null,
          slashMenuSetter: vi.fn(),
          worktreeId: 'w1',
          worktreeRoot: '/repo'
        }),
      { initialProps: { content: safeBlock } }
    )
    try {
      expect(editor.getMarkdown()).toBe(safeBlock)
      expect(editor.state.doc.firstChild?.type.name).toBe('richMarkdownSafeHtmlBlock')
      hook.rerender({ content: unsafe })
      expect(editor.getMarkdown()).toBe(unsafe)
      expect(nodeNames(editor)).not.toContain('richMarkdownSafeHtmlBlock')
      expect(nodeNames(editor)).toContain('rawMarkdownHtmlInline')
    } finally {
      hook.unmount()
      editor.destroy()
    }
  })
})
