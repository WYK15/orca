// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { DiffComment } from '../../../../shared/types'
import { useRichMarkdownReviewData } from './useRichMarkdownReviewData'

it('hides stored Markdown notes and ignores legacy enablement without deleting notes', () => {
  const notes = [
    {
      id: 'saved-note',
      filePath: 'guide.md',
      source: 'markdown',
      lineNumber: 1,
      side: 'modified',
      body: 'Stored note',
      createdAt: 1
    }
  ] as DiffComment[]
  const { result } = renderHook(() =>
    useRichMarkdownReviewData({
      allDiffComments: notes,
      filePath: '/repo/guide.md',
      markdownAnnotationsEnabled: true,
      markdownReviewContent: '# Guide',
      worktreeRoot: '/repo'
    })
  )
  expect(result.current.canAnnotateRichMarkdown).toBe(false)
  expect(result.current.markdownComments).toEqual([])
  expect(result.current.markdownReviewNotes).toEqual([])
  expect(result.current.unsentMarkdownReviewScope.flatMap((scope) => scope.notes)).toEqual([])
  expect(notes).toHaveLength(1)
  expect(notes[0].body).toBe('Stored note')
})
