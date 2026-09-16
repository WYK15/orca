import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDetailsHtmlBlockMatcher,
  detailsBodyHtmlToMarkdown,
  extractDetailsSummaryHtml,
  isEditableDetailsHtmlBlock,
  matchDetailsHtmlBlock,
  parseDetailsAttributes,
  parseToggleHeadingVariant,
  type DetailsHtmlBlock
} from './details-markdown-html'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('details markdown html', () => {
  it('reuses one fence scan while matching multiple details blocks', () => {
    const matchAll = vi.spyOn(String.prototype, 'matchAll')
    const first = '<details><summary>One</summary>Body</details>'
    const second = '<details><summary>Two</summary>Body</details>'
    const content = `${first}\n\n${second}\n`
    const matchDetails = createDetailsHtmlBlockMatcher(content)

    expect(matchDetails(0)?.raw).toBe(first)
    expect(matchDetails(content.indexOf(second))?.raw).toBe(second)

    const fenceScans = matchAll.mock.calls.filter(
      ([pattern]) => pattern instanceof RegExp && pattern.source.startsWith('[^\\r\\n]*')
    )
    expect(fenceScans).toHaveLength(1)
  })

  it('extracts leading summary html without regex capture', () => {
    const matchSpy = vi.spyOn(String.prototype, 'match')
    const inner = `\n<SUMMARY>${'Heading line\n'.repeat(1_000)}</SUMMARY><p>Body</p>`

    const summary = extractDetailsSummaryHtml(inner)

    expect(summary?.content).toContain('Heading line')
    expect(summary?.rawLength).toBe(inner.indexOf('<p>Body</p>'))
    const usedSummaryCapture = matchSpy.mock.calls.some(
      ([pattern]) =>
        pattern instanceof RegExp &&
        pattern.source.startsWith('^\\s*<summary') &&
        pattern.source.includes('[\\s\\S]')
    )
    expect(usedSummaryCapture).toBe(false)
  })

  it('accepts editable details blocks with newline-heavy summaries without summary matching', () => {
    const matchSpy = vi.spyOn(String.prototype, 'match')
    const block: DetailsHtmlBlock = {
      raw: '',
      openingAttributes: '',
      inner: `<summary>${'Heading line\n'.repeat(1_000)}</summary><p>Body</p>`,
      hasNestedDetails: false
    }

    expect(isEditableDetailsHtmlBlock(block)).toBe(true)
    const usedSummaryCapture = matchSpy.mock.calls.some(
      ([pattern]) =>
        pattern instanceof RegExp &&
        pattern.source.startsWith('^\\s*<summary') &&
        pattern.source.includes('[\\s\\S]')
    )
    expect(usedSummaryCapture).toBe(false)
  })

  it('ignores html-like tags inside fenced code when classifying editable details', () => {
    const content = [
      '<details>',
      '<summary>Example</summary>',
      '',
      '```html',
      '<Widget />',
      '```',
      'Body',
      '</details>'
    ].join('\n')
    const block = matchDetailsHtmlBlock(content, 0)

    expect(block).not.toBeNull()
    expect(isEditableDetailsHtmlBlock(block!)).toBe(true)
  })

  it('converts supported body html without rewriting fenced code', () => {
    const body = ['<p>Before<br>After</p>', '', '```html', '<p>literal</p>', '```'].join('\n')

    expect(detailsBodyHtmlToMarkdown(body)).toBe(
      ['Before', 'After', '', '', '', '```html', '<p>literal</p>', '```'].join('\n')
    )
  })

  it('accepts heading-5 toggle variants and rejects unsupported levels', () => {
    expect(parseToggleHeadingVariant('heading-5')).toBe('heading-5')
    expect(parseToggleHeadingVariant('heading-6')).toBeNull()
    expect(parseDetailsAttributes(' data-orca-toggle="heading-5"')).toMatchObject({
      variant: 'heading-5'
    })
    expect(parseDetailsAttributes(' data-orca-toggle="heading-6"')).toMatchObject({
      variant: null
    })

    const editableHeading5: DetailsHtmlBlock = {
      raw: '',
      openingAttributes: ' data-orca-toggle="heading-5"',
      inner: '<summary>Toggle</summary><p>Body</p>',
      hasNestedDetails: false
    }
    const unsupportedHeading6: DetailsHtmlBlock = {
      raw: '',
      openingAttributes: ' data-orca-toggle="heading-6"',
      inner: '<summary>Toggle</summary><p>Body</p>',
      hasNestedDetails: false
    }

    expect(isEditableDetailsHtmlBlock(editableHeading5)).toBe(true)
    expect(isEditableDetailsHtmlBlock(unsupportedHeading6)).toBe(false)
  })
})
