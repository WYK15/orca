// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRichMarkdownSafeHtml } from './rich-markdown-safe-html-source'
import {
  createRichMarkdownSafeHtmlDom,
  safeHtmlDomMatchesFragment
} from './rich-markdown-safe-html-dom'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rich Markdown safe HTML DOM projection', () => {
  it('creates only the parsed safe element tree', () => {
    const parsed = parseRichMarkdownSafeHtml(
      '<p style="color: red"><span>Alpha &amp; Beta</span><br>Tail</p>',
      'block'
    )!
    const element = createRichMarkdownSafeHtmlDom(parsed)
    expect(element.outerHTML).toBe(
      '<p style="color: red;"><span>Alpha &amp; Beta</span><br>Tail</p>'
    )
    expect(element.querySelectorAll('*')).toHaveLength(2)
  })

  it('projects validated anchor attributes and authored styles', () => {
    const parsed = parseRichMarkdownSafeHtml(
      '<a href="./guide.md" title="Guide" style="font-weight: 700">Read</a>',
      'inline'
    )!
    const element = createRichMarkdownSafeHtmlDom(parsed)
    expect(element.getAttribute('href')).toBe('./guide.md')
    expect(element.getAttribute('title')).toBe('Guide')
    expect(element.style.fontWeight).toBe('700')
    expect(Array.from(element.attributes, (attribute) => attribute.name)).toEqual([
      'href',
      'title',
      'style'
    ])
  })

  it('does not use HTML string sinks', () => {
    const innerHtmlSetter = vi.spyOn(Element.prototype, 'innerHTML', 'set')
    const insertAdjacentHtml = vi.spyOn(Element.prototype, 'insertAdjacentHTML')
    const parsed = parseRichMarkdownSafeHtml('<span><u>safe</u></span>', 'inline')!
    createRichMarkdownSafeHtmlDom(parsed)
    expect(innerHtmlSetter).not.toHaveBeenCalled()
    expect(insertAdjacentHtml).not.toHaveBeenCalled()
  })

  it('accepts an exact clipboard projection with allowed private root attributes', () => {
    const parsed = parseRichMarkdownSafeHtml('<span><u>safe</u></span>', 'inline')!
    const element = createRichMarkdownSafeHtmlDom(parsed)
    element.setAttribute('data-rich-markdown-safe-html', '1')
    element.setAttribute('data-orca-safe-html-source', parsed.source)
    expect(
      safeHtmlDomMatchesFragment(element, parsed, [
        'data-rich-markdown-safe-html',
        'data-orca-safe-html-source'
      ])
    ).toBe(true)
  })

  it.each([
    (element: HTMLElement) => element.setAttribute('onclick', 'go()'),
    (element: HTMLElement) => element.firstElementChild?.setAttribute('class', 'forged'),
    (element: HTMLElement) => {
      if (element.firstElementChild) {
        element.firstElementChild.textContent = 'changed'
      }
    },
    (element: HTMLElement) => element.append(document.createElement('script'))
  ])('rejects a forged clipboard projection', (mutate) => {
    const parsed = parseRichMarkdownSafeHtml('<span><u>safe</u></span>', 'inline')!
    const element = createRichMarkdownSafeHtmlDom(parsed)
    element.setAttribute('data-rich-markdown-safe-html', '1')
    mutate(element)
    expect(safeHtmlDomMatchesFragment(element, parsed, ['data-rich-markdown-safe-html'])).toBe(
      false
    )
  })
})
