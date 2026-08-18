import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMarkdownTableOfContents,
  stripInlineMarkdownForToc
} from './markdown-table-of-contents'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('markdown table of contents', () => {
  it('builds a nested h1-h5 outline', () => {
    const toc = buildMarkdownTableOfContents(
      '# Intro\n\n## Setup\n\n### Install\n\n#### Configure\n\n##### Options\n\n## Usage'
    )

    expect(toc).toEqual([
      {
        id: 'intro',
        level: 1,
        line: 1,
        title: 'Intro',
        children: [
          {
            id: 'setup',
            level: 2,
            line: 3,
            title: 'Setup',
            children: [
              {
                id: 'install',
                level: 3,
                line: 5,
                title: 'Install',
                children: [
                  {
                    id: 'configure',
                    level: 4,
                    line: 7,
                    title: 'Configure',
                    children: [
                      {
                        id: 'options',
                        level: 5,
                        line: 9,
                        title: 'Options',
                        children: []
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: 'usage',
            level: 2,
            line: 11,
            title: 'Usage',
            children: []
          }
        ]
      }
    ])
  })

  it('skips front matter and unsupported heading depths', () => {
    const toc = buildMarkdownTableOfContents('---\ntitle: Doc\n---\n# Visible\n###### Hidden')

    expect(toc.map((item) => item.title)).toEqual(['Visible'])
  })

  it('records source lines for ATX and setext headings', () => {
    const toc = buildMarkdownTableOfContents('---\ntitle: Doc\n---\n# Intro\n\nSetext heading\n---')

    expect(toc[0]).toMatchObject({ title: 'Intro', line: 4 })
    expect(toc[0].children[0]).toMatchObject({ title: 'Setext heading', line: 6 })
  })

  it('skips headings inside fenced code blocks', () => {
    const toc = buildMarkdownTableOfContents('# Install\n\n```sh\n# not a heading\n```\n\n## Real')

    expect(toc[0].children.map((item) => item.title)).toEqual(['Real'])
  })

  it('includes rendered markdown heading forms', () => {
    const toc = buildMarkdownTableOfContents(
      '# Intro\n\n  ## Indented\n\nSetext *Title*\n---\n\n### https://example.com'
    )

    expect(toc[0].children).toEqual([
      {
        id: 'indented',
        level: 2,
        line: 3,
        title: 'Indented',
        children: []
      },
      {
        id: 'setext-title',
        level: 2,
        line: 5,
        title: 'Setext Title',
        children: [
          {
            id: 'httpsexamplecom',
            level: 3,
            line: 8,
            title: 'https://example.com',
            children: []
          }
        ]
      }
    ])
  })

  it('uses GitHub-compatible duplicate slugs', () => {
    const toc = buildMarkdownTableOfContents('# Repeat\n# Repeat')

    expect(toc.map((item) => item.id)).toEqual(['repeat', 'repeat-1'])
  })

  it('decodes HTML entities before slugging headings', () => {
    const toc = buildMarkdownTableOfContents('# A &amp; B')

    expect(toc[0]).toMatchObject({
      id: 'a--b',
      title: 'A & B'
    })
  })

  it('strips inline markdown from labels', () => {
    expect(stripInlineMarkdownForToc('Use **bold** [links](./x) and [[docs|Docs]]')).toBe(
      'Use bold links and Docs'
    )
  })

  it('folds large pasted heading whitespace without global whitespace replacement', () => {
    const replaceSpy = vi.spyOn(String.prototype, 'replace')
    const toc = buildMarkdownTableOfContents(`# ${'Large   heading\ttext '.repeat(120)}`)

    expect(toc[0].title).toContain('Large heading text Large heading text')
    const usedWhitespaceReplace = replaceSpy.mock.calls.some(
      ([pattern]) => pattern instanceof RegExp && pattern.source === '\\s+'
    )
    expect(usedWhitespaceReplace).toBe(false)
  })
})
