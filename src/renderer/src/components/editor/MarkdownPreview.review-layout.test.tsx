// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storeState = {
  openFile: vi.fn(),
  activateMarkdownLink: vi.fn(),
  openMarkdownPreview: vi.fn(),
  setMarkdownViewMode: vi.fn(),
  markdownFrontmatterVisible: {},
  setPendingEditorReveal: vi.fn(),
  addDiffComment: vi.fn(),
  deleteDiffComment: vi.fn(),
  updateDiffComment: vi.fn(),
  clearDeliveredDiffComments: vi.fn(),
  keybindings: {},
  worktreesByRepo: {
    repo: [{ id: 'wt-1', repoId: 'repo', path: '/repo', diffComments: [] as unknown[] }]
  },
  repos: [],
  folderWorkspaces: [],
  projectGroups: [],
  openFiles: [],
  activeFileIdByWorktree: {},
  settings: { openLinksInApp: true },
  editorFontZoomLevel: 0
}

vi.mock('@/store', () => {
  const useAppStore = Object.assign(
    (selector: (s: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
  return { useAppStore }
})
vi.mock('@/store/slices/worktree-helpers', () => ({
  findWorktreeById: () => storeState.worktreesByRepo.repo[0]
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  settingsForRuntimeOwner: (settings: unknown) => settings
}))
vi.mock('@/runtime/runtime-file-client', () => ({
  statRuntimePath: vi.fn(async () => ({ isDirectory: false }))
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdForFile: () => null }))
vi.mock('@/lib/connection-owner-resolution', () => ({
  createConnectionIdForFileSelector: () => () => null
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./useLocalImageSrc', () => ({ useLocalImageSrc: (src?: string) => src }))
vi.mock('./MermaidBlock', () => ({ default: () => null }))
vi.mock('./CodeBlockCopyButton', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}))
vi.mock('../diff-comments/DiffCommentCard', () => ({ DiffCommentCard: () => null }))
vi.mock('./NotesSendMenu', () => ({ NotesSendMenu: () => null }))

vi.mock('./MarkdownTableOfContentsPanel', () => ({ MarkdownTableOfContentsPanel: () => null }))
import MarkdownPreview from './MarkdownPreview'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  storeState.worktreesByRepo.repo[0].diffComments = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function renderPreview(enabled = true): void {
  act(() =>
    root.render(
      <MarkdownPreview
        content={'# Guide\n\nParagraph\n\n- List item\n\n```js\ncode()\n```'}
        filePath="/repo/guide.md"
        scrollCacheKey="review-layout-test"
        sourceWorktreeId="wt-1"
        markdownAnnotationsEnabled={enabled}
      />
    )
  )
}

describe('MarkdownPreview without review notes', () => {
  it.each([false, true])(
    'omits all note controls and reserved columns even with legacy enablement %s',
    (enabled) => {
      storeState.worktreesByRepo.repo[0].diffComments = [
        {
          id: 'note-1',
          source: 'markdown',
          filePath: 'guide.md',
          lineNumber: 3,
          side: 'modified',
          body: 'Review this',
          createdAt: 1
        }
      ]
      renderPreview(enabled)
      expect(host.querySelector('h1')?.textContent).toBe('Guide')
      expect(host.querySelector('li')?.textContent).toBe('List item')
      expect(host.querySelector('code')?.textContent).toContain('code()')
      expect(
        host.querySelector('.markdown-annotation-block, .markdown-annotation-list-block')
      ).toBeNull()
      expect(
        host.querySelector('.markdown-annotation-controls, .markdown-review-toolbar')
      ).toBeNull()
      expect(host.querySelector('[data-annotation-block-key]')).toBeNull()
      expect(host.textContent).not.toContain('Review this')
      expect(storeState.worktreesByRepo.repo[0].diffComments).toHaveLength(1)
    }
  )
})
