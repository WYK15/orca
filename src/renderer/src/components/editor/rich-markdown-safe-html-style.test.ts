import { describe, expect, it } from 'vitest'
import { parseRichMarkdownSafeHtmlStyle } from './rich-markdown-safe-html-style'

describe('rich Markdown safe HTML styles', () => {
  it.each([
    ['color: red', { color: 'red' }],
    ['background-color: #1a2B3c', { 'background-color': '#1a2B3c' }],
    ['background: rgb(1 2 3 / 40%)', { background: 'rgb(1 2 3 / 40%)' }],
    ['font-size: 8px', { 'font-size': '8px' }],
    ['font-size: 4rem', { 'font-size': '4rem' }],
    ['font-size: 400%', { 'font-size': '400%' }],
    ['font-weight: 700', { 'font-weight': '700' }],
    ['font-style: italic', { 'font-style': 'italic' }],
    ['text-decoration: underline line-through', { 'text-decoration': 'underline line-through' }]
  ])('accepts %s', (source, expected) => {
    expect(parseRichMarkdownSafeHtmlStyle(source)).toEqual(expected)
  })

  it.each([
    'color: red; color: blue',
    'background: url(https://example.com/x)',
    'color: var(--foreground)',
    'color: red !important',
    'position: fixed',
    'display: none',
    'transform: rotate(1deg)',
    'font-size: 7px',
    'font-size: 73px',
    'font-size: 0.49em',
    'font-size: 401%',
    'font-weight: 650',
    'font-style: oblique 10deg',
    'text-decoration: blink',
    'color: \\72 ed',
    'color: #12345',
    'color: #1234567',
    'background: linear-gradient(red, blue)'
  ])('rejects %s', (source) => {
    expect(parseRichMarkdownSafeHtmlStyle(source)).toBeNull()
  })
})
