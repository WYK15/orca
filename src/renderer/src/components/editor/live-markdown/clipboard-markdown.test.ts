// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { markdownFromClipboardHtml } from './clipboard-markdown'

it('pastes formatted headings and lists as Markdown without executing HTML', () => {
  const html =
    '<h2>标题</h2><p><strong>正文</strong>与<a href="https://example.com">链接</a></p><ul><li>one</li><li>two</li></ul><script>alert(1)</script>'
  expect(markdownFromClipboardHtml(html)).toBe(
    '## 标题\n\n**正文**与[链接](https://example.com)\n\n- one\n- two'
  )
})

it('converts pasted tables and preserves literal cell pipes', () => {
  expect(
    markdownFromClipboardHtml(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>x|y</td><td>中文</td></tr></table>'
    )
  ).toBe('| A | B |\n| --- | --- |\n| x\\|y | 中文 |')
})

it('chooses a fence long enough for pasted code containing backticks', () => {
  expect(markdownFromClipboardHtml('<pre><code>```\ntext\n```</code></pre>')).toBe(
    '````\n```\ntext\n```\n````'
  )
})

it('preserves literal punctuation in pasted HTML text instead of turning it into Markdown styling', () => {
  expect(markdownFromClipboardHtml('<p>a*b*c -&gt; &lt;literal&gt;</p>')).toBe(
    'a\\*b\\*c -> \\<literal>'
  )
})
