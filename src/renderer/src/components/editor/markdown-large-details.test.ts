import { afterEach, describe, expect, it, vi } from 'vitest'
import * as roundTrip from './markdown-round-trip'
import {
  getMarkdownRichModeEligibility,
  getMarkdownRichModeUnsupportedReason
} from './markdown-rich-mode'
import { RICH_MARKDOWN_SOURCE_RECONCILE_MAX_CODE_UNITS } from './rich-markdown-source-reconcile'
import {
  detailsBodyHtmlToMarkdown,
  isEditableDetailsHtmlBlock,
  matchDetailsHtmlBlock
} from './details-markdown-html'

const LIMIT = 150_000
const wrap = (body: string) => `<details>\n<summary>Raw response</summary>\n${body}\n</details>\n`

afterEach(() => vi.restoreAllMocks())

describe('large editable details migration contract', () => {
  it.each([
    `\n\`\`\`json\n{"payload":"${'x'.repeat(75_000)}"}\n\`\`\`\n`,
    `<p>${'x'.repeat(75_000)}<br>tail</p>`,
    `\n\`\`\`html\n<Widget />\n\`\`\`\n${'x'.repeat(50_000)}`
  ])('admits supported large details', (body) => {
    expect(getMarkdownRichModeUnsupportedReason(wrap(body))).toBeNull()
  })

  it('shares the 150k UTF16 bound and admits the exact boundary only when output fits', () => {
    expect(RICH_MARKDOWN_SOURCE_RECONCILE_MAX_CODE_UNITS).toBe(LIMIT)
    const content = wrap('x'.repeat(LIMIT - wrap('').length))
    const parse = vi.spyOn(roundTrip, 'getRichMarkdownRoundTripOutput').mockReturnValue(content)
    expect(content.length).toBe(LIMIT)
    expect(getMarkdownRichModeUnsupportedReason(content)).toBeNull()
    parse.mockClear()
    expect(getMarkdownRichModeUnsupportedReason(`${content}x`)).toBe('html-or-jsx')
    expect(parse).not.toHaveBeenCalled()
  })

  it.each([
    [16, null],
    [17, 'html-or-jsx']
  ] as const)('retains the nested guard for large details at depth %s', (depth, reason) => {
    let content = wrap('x'.repeat(75_000))
    for (let level = 1; level < depth; level++) {
      content = wrap(content)
    }
    expect(getMarkdownRichModeUnsupportedReason(content)).toBe(reason)
  })

  it('keeps unknown HTML at 50k and details at the source-preservation bound', () => {
    expect(
      getMarkdownRichModeUnsupportedReason(
        `${wrap('Body')}<div>Unknown</div>\n${'x'.repeat(50_000)}`
      )
    ).toBe('html-or-jsx')
    expect(getMarkdownRichModeUnsupportedReason(wrap('x'.repeat(LIMIT)))).toBe('html-or-jsx')
  })

  it.each([
    ['[guide]: ./guide.md', 'reference-links'],
    ['[^note]: Detail', 'footnotes']
  ])('still detects unsupported syntax in details: %s', (body, reason) => {
    expect(getMarkdownRichModeUnsupportedReason(wrap(body))).toBe(reason)
  })

  it('requires the serialized output to fit the preservation bound', () => {
    vi.spyOn(roundTrip, 'getRichMarkdownRoundTripOutput').mockReturnValue('x'.repeat(LIMIT + 1))
    expect(getMarkdownRichModeUnsupportedReason(wrap('x'.repeat(75_000)))).toBe('html-or-jsx')
  })

  it('retains the global UTF8 size gate and override semantics', () => {
    const content = '界'.repeat(205_000)
    expect(getMarkdownRichModeEligibility({ content, sizeOverridden: false })).toMatchObject({
      exceedsSizeLimit: true
    })
    expect(getMarkdownRichModeEligibility({ content, sizeOverridden: true })).toMatchObject({
      exceedsSizeLimit: false
    })
  })

  it('does not reinterpret fenced details-like HTML as nested toggles', () => {
    const content = wrap('```html\n<details>literal</details>\n<Widget />\n```')
    const block = matchDetailsHtmlBlock(content, 0)
    expect(block).not.toBeNull()
    expect(isEditableDetailsHtmlBlock(block!)).toBe(true)
  })

  it('converts supported body HTML without rewriting fenced code', () => {
    const body = ['<p>Before<br>After</p>', '', '```html', '<p>literal</p>', '```'].join('\n')
    expect(detailsBodyHtmlToMarkdown(body)).toBe(
      ['Before', 'After', '', '', '', '```html', '<p>literal</p>', '```'].join('\n')
    )
  })
})
