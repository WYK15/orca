// @vitest-environment happy-dom
import { Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMacNativeTextInputSourceTracker } from './terminal-ime-input-source'
import { installTerminalImeNativeTextForwarder } from './terminal-ime-native-text-forwarder'
import { installTerminalImeCompositionTracker } from './terminal-ime-composition-tracker'

const disposables: { dispose: () => void }[] = []

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: () => ({ width: 10 })
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  disposables
    .splice(0)
    .toReversed()
    .forEach((item) => item.dispose())
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

async function openTerminal(sourceId: string | null, kitty: boolean) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const terminal = new Terminal()
  terminal.open(container)
  disposables.push(terminal)
  const textarea = terminal.textarea!
  const emitted: string[] = []
  terminal.onData((data) => emitted.push(data))
  const source = createMacNativeTextInputSourceTracker(window, {
    readInputSourceId: async () => sourceId
  })
  disposables.push(source)
  await source.refresh()
  const composition = installTerminalImeCompositionTracker(terminal.element)
  disposables.push(composition)
  const forwarder = installTerminalImeNativeTextForwarder({
    terminalElement: terminal.element,
    isComposing: composition.isActive,
    getInputSourceFeatures: source.getFeatures,
    sendInput: (data) => terminal.input(data)
  })
  disposables.push(forwarder)
  terminal.attachCustomKeyEventHandler((event) => !forwarder.claimKeyEvent(event))
  if (kitty) {
    await new Promise<void>((resolve) => terminal.write('\x1b[>1u', resolve))
  }
  return { textarea, emitted }
}

function key(
  textarea: HTMLTextAreaElement,
  type: string,
  value: string,
  keyCode = 222
): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key: value,
    code: 'Quote',
    shiftKey: true
  })
  Object.defineProperty(event, 'keyCode', { value: keyCode })
  if (type === 'keypress') {
    Object.defineProperty(event, 'charCode', { value: value.charCodeAt(0) })
  }
  textarea.dispatchEvent(event)
  return event
}

function insert(textarea: HTMLTextAreaElement, text: string): void {
  textarea.value += text
  textarea.dispatchEvent(
    new InputEvent('input', { data: text, inputType: 'insertText', composed: true, bubbles: true })
  )
}

async function commitChinese(textarea: HTMLTextAreaElement): Promise<void> {
  for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
    const event = new CompositionEvent(type, { bubbles: true })
    Object.defineProperty(event, 'data', { value: type === 'compositionstart' ? '' : '中文' })
    if (type === 'compositionend') {
      textarea.value = '中文'
    }
    textarea.dispatchEvent(event)
  }
  await new Promise((resolve) => setTimeout(resolve, 5))
}

describe('terminal Chinese quote commits', () => {
  it.each([false, true])(
    'forwards the first quote immediately and the pair once (kitty=%s)',
    async (kitty) => {
      const { textarea, emitted } = await openTerminal(
        'com.apple.inputmethod.SCIM.Shuangpin',
        kitty
      )
      await commitChinese(textarea)
      expect(emitted.join('')).toBe('中文')

      for (const glyph of ['“', '”']) {
        expect(key(textarea, 'keydown', '"').defaultPrevented).toBe(false)
        insert(textarea, glyph)
        key(textarea, 'keyup', '"')
        expect(emitted.join('')).toBe(glyph === '“' ? '中文“' : '中文“”')
      }
    }
  )

  it('does not duplicate a transformed keypress followed by its native input event', async () => {
    const { textarea, emitted } = await openTerminal('com.apple.inputmethod.SCIM.Shuangpin', true)
    key(textarea, 'keydown', '"')
    key(textarea, 'keypress', '“', 8220)
    insert(textarea, '“')
    key(textarea, 'keyup', '"')
    expect(emitted).toEqual(['“'])
  })

  it('retains ordinary English double quotes', async () => {
    const { textarea, emitted } = await openTerminal('com.apple.keylayout.ABC', false)
    for (let index = 0; index < 2; index++) {
      if (!key(textarea, 'keydown', '"').defaultPrevented) {
        key(textarea, 'keypress', '"', 34)
        insert(textarea, '"')
      }
      key(textarea, 'keyup', '"')
    }
    expect(emitted.join('')).toBe('""')
  })

  it('accepts a transformed Chinese quote even before the source probe resolves', async () => {
    const { textarea, emitted } = await openTerminal(null, true)
    key(textarea, 'keydown', '“')
    insert(textarea, '“')
    key(textarea, 'keyup', '“')
    expect(emitted).toEqual(['“'])
  })
})
