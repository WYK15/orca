// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pasteFromMenu } from './menu-paste'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Tauri menu paste', () => {
  it('passes native clipboard text and a PNG to the focused editor paste handler', async () => {
    const editor = document.createElement('div')
    editor.tabIndex = 0
    document.body.append(editor)
    editor.focus()
    let clipboard: DataTransfer | null = null
    editor.addEventListener('paste', (event) => {
      clipboard = (event as ClipboardEvent).clipboardData
      event.preventDefault()
    })
    await pasteFromMenu(async () => ({ text: '截图', png: btoa('png-fixture') }))
    expect(clipboard).not.toBeNull()
    const data = clipboard as unknown as DataTransfer
    expect(data.getData('text/plain')).toBe('截图')
    expect(data.files).toHaveLength(1)
    expect(data.files[0].type).toBe('image/png')
  })

  it('does not paste into a new target after focus moves while the clipboard is read', async () => {
    document.body.innerHTML = '<textarea id="first"></textarea><textarea id="next"></textarea>'
    const first = document.getElementById('first')!
    first.focus()
    const paste = vi.fn()
    first.addEventListener('paste', paste)
    let resolve: (value: { text: string; png: null }) => void = () => {}
    const waiting = pasteFromMenu(
      () =>
        new Promise((complete) => {
          resolve = complete
        })
    )
    document.getElementById('next')!.focus()
    resolve({ text: 'private clipboard', png: null })
    await waiting
    expect(paste).not.toHaveBeenCalled()
    expect((document.getElementById('next') as HTMLTextAreaElement).value).toBe('')
  })
})
