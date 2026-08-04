// @vitest-environment happy-dom

import React from 'react'
import { Editor } from '@tiptap/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'
import { RichMarkdownToolbar } from './RichMarkdownToolbar'

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

function createTableEditor(): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
    content: '| A | B |\n| --- | --- |\n| a | b |\n',
    contentType: 'markdown'
  })
  let cellTextPosition: number | null = null
  editor.state.doc.descendants((node, position) => {
    if (node.isText && node.text === 'A') {
      cellTextPosition = position
      return false
    }
    return true
  })
  if (cellTextPosition === null) {
    throw new Error('Expected table header text')
  }
  editor.commands.setTextSelection(cellTextPosition)
  return editor
}

afterEach(() => {
  cleanup()
  editor?.destroy()
  editor = null
})

describe('RichMarkdownToolbar', () => {
  it('places the table insertion button after the image action', () => {
    render(<RichMarkdownToolbar editor={null} onToggleLink={() => {}} onImagePick={() => {}} />)

    const imageButton = screen.getByRole('button', { name: 'Image' })
    const tableButton = screen.getByRole('button', { name: 'Table' })
    expect(
      imageButton.compareDocumentPosition(tableButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })

  it('keeps contextual row and column actions alongside table insertion', () => {
    const currentEditor = createTableEditor()
    render(
      <RichMarkdownToolbar editor={currentEditor} onToggleLink={() => {}} onImagePick={() => {}} />
    )

    const tableButton = screen.getByRole('button', { name: 'Table' })
    const insertRowButton = screen.getByRole('button', { name: 'Insert row above' })
    expect(
      tableButton.compareDocumentPosition(insertRowButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)
  })
})
