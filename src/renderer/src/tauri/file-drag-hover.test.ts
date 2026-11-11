// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNativeFileDragHover } from './file-drag-hover'

beforeEach(() => {
  // happy-dom's DragEvent omits DragEventInit.dataTransfer.
  vi.stubGlobal(
    'DragEvent',
    class extends MouseEvent {
      dataTransfer: DataTransfer | null
      constructor(type: string, init: DragEventInit = {}) {
        super(type, init)
        this.dataTransfer = init.dataTransfer ?? null
      }
    }
  )
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('native drag hover bridge', () => {
  it('enters each target once, leaves the old folder, and clears on cancellation', () => {
    document.body.innerHTML = '<div id="folder"></div><div id="other"></div>'
    const folder = document.getElementById('folder')!
    const other = document.getElementById('other')!
    const events: string[] = []
    for (const element of [folder, other]) {
      for (const name of ['dragenter', 'dragover', 'dragleave']) {
        element.addEventListener(name, (event) => {
          events.push(`${element.id}:${event.type}`)
          expect((event as DragEvent).dataTransfer?.files).toHaveLength(1)
        })
      }
    }
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(folder)
    const hover = createNativeFileDragHover()
    hover.update({ x: 10, y: 20 })
    hover.update({ x: 10, y: 21 })
    hit.mockReturnValue(other)
    hover.update({ x: 30, y: 20 })
    hover.update(null)
    hover.clear()
    expect(events).toEqual([
      'folder:dragenter',
      'folder:dragover',
      'folder:dragover',
      'folder:dragleave',
      'other:dragenter',
      'other:dragover',
      'other:dragleave'
    ])
  })
})
