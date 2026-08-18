// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownSourceEditorSurface } from './MarkdownSourceEditorSurface'

afterEach(cleanup)

describe('MarkdownSourceEditorSurface', () => {
  it('preserves the full-height flex chain required by Monaco', () => {
    render(
      <MarkdownSourceEditorSurface
        content="# Notes"
        showTableOfContents={false}
        onCloseTableOfContents={vi.fn()}
        onNavigateLine={vi.fn()}
      >
        <div data-testid="editor-surface" />
      </MarkdownSourceEditorSurface>
    )

    expect(screen.getByTestId('editor-surface').parentElement?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['flex', 'h-full', 'flex-1'])
    )
  })
})
