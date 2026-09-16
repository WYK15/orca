import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMarkdownRichModeUnsupportedMessage } from './markdown-rich-mode'
import { RICH_MARKDOWN_SOURCE_RECONCILE_MAX_CODE_UNITS } from './rich-markdown-source-reconcile'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getMarkdownRichModeUnsupportedMessage', () => {
  it('allows markdown tables once table nodes are available in rich mode', () => {
    expect(getMarkdownRichModeUnsupportedMessage('| a | b |\n| - | - |\n| 1 | 2 |\n')).toBeNull()
  })

  it('allows plain markdown content', () => {
    expect(getMarkdownRichModeUnsupportedMessage('# Title\n\n- one\n- two\n')).toBeNull()
  })

  it('allows common raw html in markdown files', () => {
    expect(getMarkdownRichModeUnsupportedMessage('Before <span>hi</span> after\n')).toBeNull()
  })

  it('allows markdown autolinks wrapped in angle brackets', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('See <https://example.com/docs> for details.\n')
    ).toBeNull()
  })

  it('allows code fences with language info strings', () => {
    expect(getMarkdownRichModeUnsupportedMessage('```ts\nconst answer = 42\n```\n')).toBeNull()
  })

  it('ignores table syntax inside fenced code blocks', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('```md\n| a | b |\n| - | - |\n| 1 | 2 |\n```\n')
    ).toBeNull()
  })

  it('ignores jsx-looking tags inside code spans and fences', () => {
    expect(getMarkdownRichModeUnsupportedMessage('Use `<Widget />` in docs.\n')).toBeNull()
    expect(getMarkdownRichModeUnsupportedMessage('```tsx\n<Widget />\n```\n')).toBeNull()
    expect(getMarkdownRichModeUnsupportedMessage('```tsx\r\n<Widget />\r\n```\r\n')).toBeNull()
  })

  it('allows angle brackets in ordinary prose', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('Use 1 < 2 and 3 > 2 in the example.\n')
    ).toBeNull()
  })

  it('allows block html and mdx-like tags by preserving them as passthrough nodes', () => {
    expect(getMarkdownRichModeUnsupportedMessage('<Widget />\n')).toBeNull()
    expect(getMarkdownRichModeUnsupportedMessage('<div>block</div>\n')).toBeNull()
  })

  it('allows large editable details blocks within the source-preservation limit', () => {
    const content = [
      '<details>',
      '<summary>Raw response</summary>',
      '',
      '```json',
      `{"payload":"${'x'.repeat(75_000)}"}`,
      '```',
      '',
      '</details>',
      ''
    ].join('\n')

    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()
  })

  it('allows editable details blocks with supported paragraph and break tags', () => {
    const content = `<details>\n<summary>Raw response</summary>\n<p>${'x'.repeat(
      75_000
    )}<br>tail</p>\n</details>\n`

    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()
  })

  it('keeps the 50k limit when editable details are mixed with unknown html', () => {
    const content = `<details>\n<summary>Known</summary>\nBody\n</details>\n<div>Unknown</div>\n${'x'.repeat(
      50_000
    )}`

    expect(getMarkdownRichModeUnsupportedMessage(content)).not.toBeNull()
  })

  it('allows large editable details containing html-like fenced code', () => {
    const content = `<details>\n<summary>Example</summary>\n\n\`\`\`html\n<Widget />\n\`\`\`\n${'x'.repeat(
      50_000
    )}\n</details>\n`

    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()
  })

  it('blocks editable details blocks beyond the source-preservation limit', () => {
    const content = `<details>\n<summary>Raw</summary>\n${'x'.repeat(
      RICH_MARKDOWN_SOURCE_RECONCILE_MAX_CODE_UNITS
    )}\n</details>\n`

    expect(getMarkdownRichModeUnsupportedMessage(content)).not.toBeNull()
  })

  it('still detects unsupported syntax inside editable details blocks', () => {
    const content = '<details>\n<summary>Links</summary>\n\n[guide]: ./guide.md\n</details>\n'

    expect(getMarkdownRichModeUnsupportedMessage(content)).toContain('reference-style links')
  })

  it('still detects footnotes inside editable details blocks', () => {
    const content = '<details>\n<summary>Notes</summary>\n\n[^note]: Detail\n</details>\n'

    expect(getMarkdownRichModeUnsupportedMessage(content)).toContain('footnotes')
  })

  it('allows markdown files with front-matter', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('---\ntitle: Hello\ntags: [a, b]\n---\n# Body\n')
    ).toBeNull()
  })

  it('allows TOML front-matter delimited by +++', () => {
    expect(getMarkdownRichModeUnsupportedMessage('+++\ntitle = "Hello"\n+++\nBody\n')).toBeNull()
  })

  it('allows front-matter with clean markdown body', () => {
    expect(
      getMarkdownRichModeUnsupportedMessage('---\ntitle: Docs\n---\n# Heading\n\n- one\n- two\n')
    ).toBeNull()
  })

  it('strips newline-heavy fenced code without splitting the full body', () => {
    const split = vi.spyOn(String.prototype, 'split')
    const content = `${'```tsx\n<Widget />\n```\n'.repeat(10_000)}# Tail\n`

    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()

    expect(split).not.toHaveBeenCalled()
  })

  it('preserves newline-heavy embedded html without global fragment matching', () => {
    const matchSpy = vi.spyOn(String.prototype, 'match')
    const content = `${'<span>hi</span>\n'.repeat(1_000)}Tail\n`

    expect(getMarkdownRichModeUnsupportedMessage(content)).toBeNull()

    const usedGlobalHtmlFragmentMatch = matchSpy.mock.calls.some(
      ([pattern]) =>
        pattern instanceof RegExp &&
        pattern.global &&
        pattern.source.startsWith('<!--[\\s\\S]*?-->')
    )
    expect(usedGlobalHtmlFragmentMatch).toBe(false)
  })
})
