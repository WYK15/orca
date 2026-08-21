// @vitest-environment happy-dom

import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichMarkdownTableSizeGrid } from './RichMarkdownTableSizeGrid'
import type { RichMarkdownTableDimensions } from './rich-markdown-table-insertion'

afterEach(cleanup)

function Harness({
  onSelect
}: {
  onSelect: (dimensions: RichMarkdownTableDimensions) => void
}): React.JSX.Element {
  const [selection, setSelection] = useState({ bodyRows: 3, columns: 3 })
  return (
    <RichMarkdownTableSizeGrid
      selection={selection}
      onSelectionChange={setSelection}
      onSelect={onSelect}
    />
  )
}

describe('RichMarkdownTableSizeGrid', () => {
  it('previews and selects a size from the labelled 10 by 10 grid', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    expect(screen.getAllByRole('gridcell')).toHaveLength(100)
    const target = screen.getByRole('gridcell', { name: '4 body rows by 5 columns' })
    fireEvent.mouseEnter(target)
    expect(screen.getByText('4 body rows × 5 columns, plus 1 header row')).toBeTruthy()
    fireEvent.click(target)
    expect(onSelect).toHaveBeenCalledWith({ bodyRows: 4, columns: 5 })
  })

  it('moves selection with arrow keys and confirms with Enter', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    const selectedCell = screen.getByRole('gridcell', { name: '3 body rows by 3 columns' })
    selectedCell.focus()
    fireEvent.keyDown(selectedCell, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith({ bodyRows: 4, columns: 4 })
  })

  it('confirms with Space and clamps arrow movement at grid edges', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    const edge = screen.getByRole('gridcell', { name: '1 body rows by 1 columns' })
    edge.focus()
    fireEvent.keyDown(edge, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement!, { key: ' ' })

    expect(onSelect).toHaveBeenCalledWith({ bodyRows: 1, columns: 1 })
  })
})
