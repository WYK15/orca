// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import type { EditorView } from '@tiptap/pm/view'
import { handleRichMarkdownEditorClick } from './rich-markdown-editor-click-routing'
import type { HttpLinkSourceOwner } from '@/lib/http-link-routing'

const openHttpLinkMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/http-link-routing', () => ({
  openHttpLink: openHttpLinkMock
}))

beforeEach(() => {
  openHttpLinkMock.mockReset()
})

// Why: the preview deliberately routes differently; this pins the editor side so a
// future "make them consistent" change cannot land silently.
function clickExternalLinkWithShift(sourceOwner: HttpLinkSourceOwner, isMac = true): boolean {
  const href = 'https://example.com/docs'
  const view = {
    state: {
      doc: {
        nodeAt: () => null,
        resolve: () => ({
          marks: () => [{ type: { name: 'link' }, attrs: { href } }]
        })
      }
    }
  } as unknown as EditorView

  return handleRichMarkdownEditorClick({
    activateMarkdownLink: vi.fn(),
    editorRef: { current: {} } as unknown as MutableRefObject<unknown>,
    event: { metaKey: isMac, ctrlKey: !isMac, shiftKey: true } as MouseEvent,
    filePath: '/repo/docs/README.md',
    isMac,
    htmlSuperscriptLinkContext: {
      getSnapshot: () => ({ sourceOwner })
    },
    markdownCommentsRef: { current: [] },
    markdownSourceLineOffsetRef: { current: 0 },
    onOpenDocLinkRef: { current: undefined },
    pos: 1,
    rootRef: { current: null },
    scrollRichMarkdownReviewNoteCardIntoView: vi.fn(),
    settings: {} as never,
    view,
    worktreeId: 'wt-1',
    worktreeRoot: '/repo'
  } as never)
}

describe('rich markdown editor Shift+modifier click on external links', () => {
  // Why: intentionally NOT the preview's behavior — this path hands the link to the
  // client OS, so it must keep forcing the system browser even when inverting is on.
  it('forces the system browser rather than following the invert setting', () => {
    expect(clickExternalLinkWithShift({ kind: 'local' })).toBe(true)
    expect(openHttpLinkMock).toHaveBeenCalledWith('https://example.com/docs', {
      forceSystemBrowser: true,
      sourceOwner: { kind: 'local' }
    })
  })

  // Why: AGENTS.md — Shift+Ctrl is the chord off macOS, and modKey reads a
  // different event field there.
  it('uses the Ctrl chord off macOS', () => {
    expect(clickExternalLinkWithShift({ kind: 'local' }, false)).toBe(true)
    expect(openHttpLinkMock).toHaveBeenCalledWith('https://example.com/docs', {
      forceSystemBrowser: true,
      sourceOwner: { kind: 'local' }
    })
  })

  it('forwards a non-local source owner untouched', () => {
    const sourceOwner = { kind: 'ssh', connectionId: 'conn-1' } as HttpLinkSourceOwner

    expect(clickExternalLinkWithShift(sourceOwner)).toBe(true)
    expect(openHttpLinkMock).toHaveBeenCalledWith(
      'https://example.com/docs',
      expect.objectContaining({ forceSystemBrowser: true, sourceOwner })
    )
  })
})

function clickSafeHtml({
  href,
  isMac = true,
  modifier = true,
  targetAnchor = true,
  editorRoot = null,
  sourceOwner = { kind: 'local' } as HttpLinkSourceOwner
}: {
  href: string
  isMac?: boolean
  modifier?: boolean
  targetAnchor?: boolean
  editorRoot?: HTMLElement | null
  sourceOwner?: HttpLinkSourceOwner
}) {
  const safeRoot = document.createElement('span')
  safeRoot.dataset.richMarkdownSafeHtmlNode = 'inline'
  const anchor = document.createElement('a')
  anchor.setAttribute('href', href)
  const label = document.createElement('u')
  label.textContent = 'Open'
  anchor.appendChild(label)
  safeRoot.appendChild(anchor)
  const source = `<a href="${href}"><u>Open</u></a>`
  const activateMarkdownLink = vi.fn()
  const view = {
    nodeDOM: () => safeRoot,
    state: {
      doc: {
        nodeAt: () => ({
          type: { name: 'richMarkdownSafeHtmlInline' },
          attrs: { source }
        }),
        resolve: () => ({ marks: () => [] })
      }
    }
  } as unknown as EditorView
  const event = {
    target: targetAnchor ? label : safeRoot,
    metaKey: isMac && modifier,
    ctrlKey: !isMac && modifier,
    shiftKey: false
  } as unknown as MouseEvent
  const result = handleRichMarkdownEditorClick({
    activateMarkdownLink,
    editorRef: { current: {} } as unknown as MutableRefObject<unknown>,
    event,
    filePath: '/repo/docs/README.md',
    isMac,
    htmlSuperscriptLinkContext: {
      getSnapshot: () => ({
        version: 0,
        sourceFilePath: '/repo/docs/README.md',
        worktreeId: 'wt-1',
        worktreeRoot: '/repo',
        sourceOwner
      })
    },
    markdownCommentsRef: { current: [] },
    markdownSourceLineOffsetRef: { current: 0 },
    onOpenDocLinkRef: { current: undefined },
    pos: 1,
    rootRef: { current: editorRoot },
    scrollRichMarkdownReviewNoteCardIntoView: vi.fn(),
    settings: {} as never,
    view,
    worktreeId: 'wt-1',
    worktreeRoot: '/repo'
  } as never)
  return { activateMarkdownLink, result }
}

describe('rich markdown safe HTML link routing', () => {
  it.each([
    'https://example.com/docs',
    '../guide.md',
    'file:///repo/guide.md',
    'mailto:dev@example.com'
  ])('routes a validated %s target through the existing activator', (href) => {
    const { activateMarkdownLink, result } = clickSafeHtml({ href })
    expect(result).toBe(true)
    expect(activateMarkdownLink).toHaveBeenCalledWith(
      href,
      expect.objectContaining({
        sourceFilePath: '/repo/docs/README.md',
        worktreeId: 'wt-1',
        worktreeRoot: '/repo',
        sourceOwner: { kind: 'local' }
      })
    )
  })

  it('requires Command on macOS and Control elsewhere', () => {
    expect(clickSafeHtml({ href: './guide.md', modifier: false }).result).toBe(false)
    expect(clickSafeHtml({ href: './guide.md', isMac: false }).result).toBe(true)
  })

  it('forwards SSH ownership without treating the target as local', () => {
    const sourceOwner = { kind: 'ssh', connectionId: 'conn-1' } as HttpLinkSourceOwner
    const { activateMarkdownLink } = clickSafeHtml({ href: './guide.md', sourceOwner })
    expect(activateMarkdownLink).toHaveBeenCalledWith(
      './guide.md',
      expect.objectContaining({ sourceOwner })
    )
  })

  it('scrolls hash links inside the current editor', () => {
    const editorRoot = document.createElement('div')
    const heading = document.createElement('h2')
    const scrollIntoView = vi.fn()
    heading.textContent = 'Section'
    heading.scrollIntoView = scrollIntoView
    editorRoot.appendChild(heading)
    const { activateMarkdownLink, result } = clickSafeHtml({
      href: '#section',
      editorRoot
    })
    expect(result).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(activateMarkdownLink).not.toHaveBeenCalled()
  })

  it('does not activate non-anchor content in a safe atom', () => {
    const { activateMarkdownLink, result } = clickSafeHtml({
      href: './guide.md',
      targetAnchor: false
    })
    expect(result).toBe(false)
    expect(activateMarkdownLink).not.toHaveBeenCalled()
  })
})
