// @vitest-environment happy-dom

import React from 'react'
import { Editor } from '@tiptap/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichMarkdownTableInsertMenu } from './RichMarkdownTableInsertMenu'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'

vi.mock('@/components/ui/popover', async () => {
  const ReactModule = await import('react')
  type PopoverState = {
    open: boolean
    onOpenChange: (open: boolean) => void
  }
  const PopoverContext = ReactModule.createContext<PopoverState | null>(null)

  return {
    Popover: ({ open, onOpenChange, children }: PopoverState & { children?: React.ReactNode }) =>
      ReactModule.createElement(
        PopoverContext.Provider,
        { value: { open, onOpenChange } },
        children
      ),
    PopoverTrigger: ({ children }: { children: React.ReactElement }) => {
      const state = ReactModule.useContext(PopoverContext)
      return ReactModule.cloneElement(children, {
        onClick: () => state?.onOpenChange(!state.open)
      } as React.HTMLAttributes<HTMLElement>)
    },
    PopoverContent: ({ children }: { children?: React.ReactNode }) => {
      const state = ReactModule.useContext(PopoverContext)
      return state?.open
        ? ReactModule.createElement(
            'div',
            {
              role: 'dialog',
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === 'Escape') {
                  state.onOpenChange(false)
                }
              }
            },
            children
          )
        : null
    }
  }
})

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

vi.mock('@/components/ui/tooltip', async () => {
  const ReactModule = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children)
  return {
    Tooltip: passthrough,
    TooltipContent: () => null,
    TooltipProvider: passthrough,
    TooltipTrigger: passthrough
  }
})

let editor: Editor | null = null

function createEditor(): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
    content: 'Before',
    contentType: 'markdown'
  })
  return editor
}

function tableDimensions(currentEditor: Editor): { rows: number; columns: number } {
  let rows = 0
  let columns = 0
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow') {
      rows += 1
      columns = Math.max(columns, node.childCount)
    }
  })
  return { rows, columns }
}

afterEach(() => {
  cleanup()
  editor?.destroy()
  editor = null
})

describe('RichMarkdownTableInsertMenu', () => {
  it('inserts the quick-grid size and closes the popover', () => {
    const currentEditor = createEditor()
    render(<RichMarkdownTableInsertMenu editor={currentEditor} />)

    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    fireEvent.click(screen.getByRole('gridcell', { name: '2 body rows by 4 columns' }))

    expect(tableDimensions(currentEditor)).toEqual({ rows: 3, columns: 4 })
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('inherits the grid selection in the custom-size dialog', () => {
    const currentEditor = createEditor()
    render(<RichMarkdownTableInsertMenu editor={currentEditor} />)

    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    fireEvent.mouseEnter(screen.getByRole('gridcell', { name: '7 body rows by 8 columns' }))
    fireEvent.click(screen.getByRole('button', { name: 'Custom size' }))

    expect((screen.getByLabelText('Body rows') as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText('Columns') as HTMLInputElement).value).toBe('8')
    fireEvent.change(screen.getByLabelText('Body rows'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))

    expect(tableDimensions(currentEditor)).toEqual({ rows: 3, columns: 3 })
  })

  it('keeps the quick grid open when no editor can insert', () => {
    render(<RichMarkdownTableInsertMenu editor={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    fireEvent.click(screen.getByRole('gridcell', { name: '2 body rows by 4 columns' }))

    expect(screen.getByText('Could not insert table')).toBeTruthy()
    expect(screen.getByRole('grid')).toBeTruthy()
  })

  it('closes on Escape without changing the document', () => {
    const currentEditor = createEditor()
    const before = currentEditor.getMarkdown()
    render(<RichMarkdownTableInsertMenu editor={currentEditor} />)

    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('grid')).toBeNull()
    expect(currentEditor.getMarkdown()).toBe(before)
  })
})
