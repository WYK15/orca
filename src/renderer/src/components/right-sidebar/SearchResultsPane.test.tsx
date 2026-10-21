// @vitest-environment happy-dom
import { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SearchResultsPane } from './SearchResultsPane'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({ getTotalSize: () => 0, getVirtualItems: () => [] })
}))

afterEach(cleanup)

it('shows an explicit empty result after a completed search', () => {
  render(
    <SearchResultsPane
      results={{ files: [], totalMatches: 0, truncated: false }}
      hasCommittedResults
      query="HOST"
      loading={false}
      rows={[]}
      scrollRef={createRef<HTMLDivElement>()}
      onToggleCollapsedFile={vi.fn()}
      onMatchClick={vi.fn()}
    />
  )
  expect(screen.getByRole('status').textContent).toBe('No matches')
})
