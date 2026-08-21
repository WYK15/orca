// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichMarkdownTableSizeDialog } from './RichMarkdownTableSizeDialog'

vi.mock('@/components/ui/dialog', async () => {
  const ReactModule = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children)
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? children : null,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough
  }
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

afterEach(cleanup)

function renderDialog(onInsert = vi.fn(() => true), onOpenChange = vi.fn()) {
  render(
    <RichMarkdownTableSizeDialog
      open
      initialDimensions={{ bodyRows: 4, columns: 5 }}
      onOpenChange={onOpenChange}
      onInsert={onInsert}
    />
  )
  return { onInsert, onOpenChange }
}

describe('RichMarkdownTableSizeDialog', () => {
  it('inherits dimensions and submits valid integers', () => {
    const { onInsert, onOpenChange } = renderDialog()

    expect(screen.getByLabelText('Body rows')).toHaveValue(4)
    expect(screen.getByLabelText('Columns')).toHaveValue(5)
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(onInsert).toHaveBeenCalledWith({ bodyRows: 4, columns: 5 })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ['Body rows', '', 'Enter a whole number from 1 to 100'],
    ['Body rows', '1.5', 'Enter a whole number from 1 to 100'],
    ['Body rows', '101', 'Enter a whole number from 1 to 100'],
    ['Columns', '51', 'Enter a whole number from 1 to 50']
  ])('rejects invalid %s value %s', (label, value, message) => {
    const { onInsert } = renderDialog()

    fireEvent.change(screen.getByLabelText(label), { target: { value } })

    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('closes without insertion on cancel', () => {
    const { onInsert, onOpenChange } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('stays open and reports an insertion failure', () => {
    const { onOpenChange } = renderDialog(vi.fn(() => false))

    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(screen.getByText('Could not insert table')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
