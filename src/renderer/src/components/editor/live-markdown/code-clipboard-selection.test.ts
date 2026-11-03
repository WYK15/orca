// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { expect, it, vi } from 'vitest'
import { markdownEditorExtensions } from './editor-extensions'
import { markdownEditorMode, type MarkdownEditorMode } from './editor-context'
import { copyClipboardMarkdown } from './clipboard-markdown'

function copy(source: string, selected: string, mode: MarkdownEditorMode = 'live') {
  const from = source.indexOf(selected)
  expect(from).toBeGreaterThanOrEqual(0)
  const state = EditorState.create({
    doc: source,
    selection: { anchor: from, head: from + selected.length },
    extensions: [markdownEditorMode.of(mode), markdownEditorExtensions()]
  })
  const data = new Map<string, string>()
  const event = {
    preventDefault: vi.fn(),
    clipboardData: { setData: (type: string, text: string) => data.set(type, text) }
  }
  expect(copyClipboardMarkdown(event as unknown as ClipboardEvent, { state } as EditorView)).toBe(
    true
  )
  expect(event.preventDefault).toHaveBeenCalledOnce()
  return { plain: data.get('text/plain'), html: data.get('text/html') }
}

it.each(['live', 'preview', 'source'] as const)(
  'copies a text-code fragment literally in %s mode',
  (mode) => {
    const text = '*literal* -> &amp; <tag> [name](path)'
    const result = copy(`# Title\n\n\`\`\`text\n${text}\nnext\n\`\`\``, text, mode)
    expect(result.plain).toBe(text)
    if (mode !== 'source') {
      expect(result.html).toContain('<pre><code>')
      expect(result.html).toContain('&amp;amp; &lt;tag&gt;')
      expect(result.html).not.toContain('<tag>')
    }
  }
)

it('preserves blank lines, trailing whitespace and literal markup across code lines', () => {
  const text = 'first *literal*  \n\n  &amp; <script>alert(1)</script>\nlast\t'
  const result = copy(`~~~text\n${text}\n~~~`, text)
  expect(result.plain).toBe(text)
  expect(result.html).toContain('&lt;script&gt;')
  expect(result.html).not.toContain('<script>')
})

it('preserves a literal fragment in an indented code block', () => {
  const text = '*literal* &amp; <tag>'
  expect(copy(`before\n\n    ${text}\n\nafter`, text).plain).toBe(text)
})

it('preserves a literal fragment inside inline code', () => {
  const text = '*literal* &amp; <tag>'
  expect(copy(`before \`${text}\` after`, text).plain).toBe(text)
})

it('retains formatted copying for an entire fenced block and ordinary Markdown', () => {
  const block = '```text\n*literal* &amp; <tag>\n```'
  expect(copy(block, block).plain).toBe('*literal* &amp; <tag>')
  expect(copy('before **bold** after', '**bold**').plain).toBe('bold')
})
