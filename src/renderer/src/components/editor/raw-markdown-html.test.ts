// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { encodeRawMarkdownHtmlForRichEditor } from './raw-markdown-html'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'

const KEY = '0123456789abcdef0123456789abcdef'

function encode(source: string, htmlSuperscriptLinks = false) {
  const codec = createRichMarkdownEditorCodec(KEY)
  return {
    encoded: encodeRawMarkdownHtmlForRichEditor(source, codec, { htmlSuperscriptLinks }),
    transport: codec.transport
  }
}

describe('raw Markdown HTML preprocessing', () => {
  it.each(['Before <span>safe</span> after', 'First<br>Second', '<a href="./guide.md">Guide</a>'])(
    'transports safe inline HTML before raw HTML: %s',
    (source) => {
      const { encoded, transport } = encode(source)
      expect(encoded).toContain(transport.startFor('safe-inline-html'))
      expect(encoded).not.toContain(transport.startFor('inline-html'))
    }
  )

  it('transports a complete multiline safe block', () => {
    const source = '<p>Alpha\n<span>Beta</span>\nGamma</p>\nAfter'
    const { encoded, transport } = encode(source)
    expect(encoded).toContain(
      transport.create('safe-block-html', '<p>Alpha\n<span>Beta</span>\nGamma</p>')
    )
    expect(encoded).not.toContain(transport.startFor('block-html'))
  })

  it.each([
    '<div>unsupported</div>',
    '<a href="javascript:alert(1)">unsafe</a>',
    '<span onclick="go()">unsafe</span>'
  ])('leaves unsupported HTML on the existing raw transport: %s', (source) => {
    const { encoded, transport } = encode(source)
    expect(encoded).not.toContain(transport.startFor('safe-inline-html'))
    expect(encoded).toContain(transport.startFor('inline-html'))
  })

  it.each(['`<span>code</span>`', '```\n<span>code</span>\n```', '\\<span>escaped</span>'])(
    'does not transport safe HTML in protected Markdown: %s',
    (source) => {
      const { encoded, transport } = encode(source)
      expect(encoded).not.toContain(transport.startFor('safe-inline-html'))
    }
  )

  it('keeps editable details ahead of safe block matching', () => {
    const source = '<details><summary>Toggle</summary><p>Body</p></details>'
    const { encoded, transport } = encode(source)
    expect(encoded).toBe(source)
    expect(encoded).not.toContain(transport.startFor('safe-block-html'))
  })

  it('keeps specialized superscript links ahead of safe inline matching', () => {
    const source = '<sup><a href="https://example.com">[1]</a></sup>'
    const { encoded, transport } = encode(source, true)
    expect(encoded).toContain(transport.startFor('html-superscript-link'))
    expect(encoded).not.toContain(transport.startFor('safe-inline-html'))
  })
})
