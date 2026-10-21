// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTitlebarDrag } from './titlebar-drag'

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-regular-terminal-input-focused')
})

describe('Tauri titlebar drag', () => {
  it('drags blank titlebar space and maximizes on double click', () => {
    document.body.innerHTML = '<header class="titlebar"><span id="empty">Orca</span></header>'
    const window = { startDragging: vi.fn(async () => {}), toggleMaximize: vi.fn(async () => {}) }
    const stop = installTitlebarDrag(window)
    try {
      document
        .querySelector('#empty')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 1 }))
      expect(window.startDragging).toHaveBeenCalledOnce()
      document
        .querySelector('#empty')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, detail: 2 }))
      expect(window.toggleMaximize).toHaveBeenCalledOnce()
    } finally {
      stop()
    }
  })

  it('preserves buttons, tabs, portal controls and terminal focus release', () => {
    document.body.innerHTML =
      '<header class="titlebar"><button><span id="button">open</span></button><div role="tab" id="tab">terminal</div><div data-slot="dialog-content" id="dialog">dialog</div><span id="empty">blank</span></header>'
    document
      .querySelector<HTMLElement>('.titlebar')!
      .style.setProperty('--orcaw-window-region', 'drag')
    const window = { startDragging: vi.fn(async () => {}), toggleMaximize: vi.fn(async () => {}) }
    const stop = installTitlebarDrag(window)
    try {
      for (const id of ['button', 'tab', 'dialog']) {
        document
          .getElementById(id)!
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      }
      document.documentElement.setAttribute('data-regular-terminal-input-focused', '')
      document
        .getElementById('empty')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      expect(window.startDragging).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })

  it('honors existing CSS and React inline no-drag regions on non-button controls', () => {
    document.body.innerHTML =
      '<header class="titlebar"><span id="css" style="--orcaw-window-region: no-drag">profile</span><span id="inline">tabs</span></header>'
    const element = document.getElementById('inline')!
    Object.assign(element.style, { WebkitAppRegion: 'no-drag' })
    const window = { startDragging: vi.fn(async () => {}), toggleMaximize: vi.fn(async () => {}) }
    const stop = installTitlebarDrag(window)
    try {
      for (const id of ['css', 'inline']) {
        document
          .getElementById(id)!
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      }
      expect(window.startDragging).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })
})
