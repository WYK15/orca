import { describe, expect, it } from 'vitest'
import {
  SAFE_HTML_INLINE_BYTE_LIMIT,
  matchRichMarkdownSafeHtml,
  parseRichMarkdownSafeHtml
} from './rich-markdown-safe-html-source'

describe('rich Markdown safe HTML source', () => {
  it.each([
    '<a href="https://example.com" title="Docs">link</a>',
    '<span style="color: #fff"><u>text</u></span>',
    '<mark>marked</mark>',
    '<sub>x</sub>',
    '<sup>2</sup>',
    '<kbd>Ctrl</kbd>',
    '<br>',
    '<br/>',
    '<br />'
  ])('parses safe inline source exactly: %s', (source) => {
    const parsed = parseRichMarkdownSafeHtml(source, 'inline')
    expect(parsed?.source).toBe(source)
    expect(parsed?.kind).toBe('inline')
  })

  it.each(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])(
    'parses a safe %s block with inline descendants',
    (tag) => {
      const source = `<${tag}><span>Alpha &amp; Beta</span><br>Tail</${tag}>`
      const parsed = parseRichMarkdownSafeHtml(source, 'block')
      expect(parsed?.source).toBe(source)
      expect(parsed?.root.tagName).toBe(tag)
      expect(parsed?.root.children[0]).toMatchObject({
        type: 'element',
        children: [{ type: 'text', value: 'Alpha & Beta' }]
      })
    }
  )

  it('decodes named and numeric references only in the render tree', () => {
    const source = '<a href="./x" title="A &amp; B">&#169; &copy; &lt;</a>'
    const parsed = parseRichMarkdownSafeHtml(source)
    expect(parsed?.source).toBe(source)
    expect(parsed?.root.attributes.title).toBe('A & B')
    expect(parsed?.root.children).toEqual([{ type: 'text', value: '© © <' }])
  })

  it.each([
    '<a href="javascript:alert(1)">x</a>',
    '<a href="jav&#x61;script:alert(1)">x</a>',
    '<a href="data:text/html,x">x</a>',
    '<a href="x" href="y">x</a>',
    '<a href="">x</a>',
    '<span onclick="go()">x</span>',
    '<span class="orca">x</span>',
    '<span style="position: fixed">x</span>',
    '<span style="color: red; color: blue">x</span>',
    '<span style="background: url(x)">x</span>',
    '<br style="color:red">'
  ])('rejects unsafe source: %s', (source) => {
    expect(parseRichMarkdownSafeHtml(source)).toBeNull()
  })

  it.each([
    '<a href="#section">x</a>',
    '<a href="./guide.md">x</a>',
    '<a href="file:///tmp/guide.md">x</a>',
    '<a href="mailto:a@example.com">x</a>',
    '<span style="font-size: 72px; font-weight: 700">x</span>'
  ])('accepts safe attributes and targets: %s', (source) => {
    expect(parseRichMarkdownSafeHtml(source)).not.toBeNull()
  })

  it.each([
    '<span><u>x</span></u>',
    '<span><!--x--></span>',
    '<span><Widget /></span>',
    '<p><p>nested block</p></p>',
    '<span>line\nbreak</span>',
    '<span>unterminated',
    '<span>&unknown;</span>'
  ])('rejects malformed or out-of-scope source: %s', (source) => {
    expect(parseRichMarkdownSafeHtml(source)).toBeNull()
  })

  it('enforces byte limits rather than UTF-16 length', () => {
    const source = `<span>${'界'.repeat(6_000)}</span>`
    expect(source.length).toBeLessThan(SAFE_HTML_INLINE_BYTE_LIMIT)
    expect(parseRichMarkdownSafeHtml(source, 'inline')).toBeNull()
  })

  it('rejects a ninth element level', () => {
    const source = `${'<span>'.repeat(9)}x${'</span>'.repeat(9)}`
    expect(parseRichMarkdownSafeHtml(source)).toBeNull()
  })

  it('matches one balanced root without consuming trailing Markdown', () => {
    const content = 'Before <span>safe</span> after'
    const parsed = matchRichMarkdownSafeHtml(content, 7, 'inline')
    expect(parsed?.source).toBe('<span>safe</span>')
  })

  it('requires block roots to begin at a line boundary', () => {
    expect(matchRichMarkdownSafeHtml('Before <p>text</p>', 7, 'block')).toBeNull()
    expect(matchRichMarkdownSafeHtml('Before\n<p>text</p>\nAfter', 7, 'block')?.source).toBe(
      '<p>text</p>'
    )
  })

  it.each([
    `<span ${'x'.repeat(4_000)}`,
    `<span>${'</u>'.repeat(1_000)}`,
    `<span ${'a='.repeat(2_000)}>`
  ])('keeps adversarial scans linear', (source) => {
    const stats = { transitions: 0 }
    expect(parseRichMarkdownSafeHtml(source, undefined, stats)).toBeNull()
    expect(stats.transitions).toBeLessThan(source.length * 8)
  })
})
