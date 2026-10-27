// @vitest-environment happy-dom
import { Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMacNativeTextInputSourceTracker } from './terminal-ime-input-source'
import { installTerminalImeNativeTextForwarder } from './terminal-ime-native-text-forwarder'
import { installTerminalImeCompositionTracker } from './terminal-ime-composition-tracker'
import { shouldSuppressTerminalImeKeyboardEvent } from './xterm-bypass-policy'

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

async function openTerminal(sourceId: string | null, kitty: boolean | number) {
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
  terminal.attachCustomKeyEventHandler((event) => {
    if (
      shouldSuppressTerminalImeKeyboardEvent(event, {
        compositionActive: composition.isActive(),
        candidateKeyGuardActive: composition.isCandidateKeyGuardActive(),
        pendingCandidateKeyReleaseActive: false,
        isMac: true,
        isLinux: false
      })
    ) {
      return false
    }
    return !forwarder.claimKeyEvent(event)
  })
  if (kitty) {
    const flags = typeof kitty === 'number' ? kitty : 1
    await new Promise<void>((resolve) => terminal.write(`\x1b[>${flags}u`, resolve))
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

function nativeInsert(textarea: HTMLTextAreaElement, text: string): void {
  textarea.dispatchEvent(
    new InputEvent('beforeinput', {
      data: text,
      inputType: 'insertText',
      composed: true,
      bubbles: true,
      cancelable: true
    })
  )
  insert(textarea, text)
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
  it.each([false, 1, 31])(
    'forwards observed macOS WebKit text-before-keydown quotes immediately (kitty=%s)',
    async (kitty) => {
      const { textarea, emitted } = await openTerminal(
        'com.apple.inputmethod.SCIM.Shuangpin',
        kitty
      )
      await commitChinese(textarea)
      const shift = new KeyboardEvent('keydown', {
        key: 'Shift',
        code: 'ShiftLeft',
        shiftKey: true,
        bubbles: true
      })
      Object.defineProperty(shift, 'keyCode', { value: 16 })
      textarea.dispatchEvent(shift)
      const prefix = emitted.join('')

      for (const [index, glyph] of ['“', '”'].entries()) {
        nativeInsert(textarea, glyph)
        expect(emitted.join('')).toBe(prefix + '“”'.slice(0, index + 1))
        key(textarea, 'keydown', '"', 229)
        key(textarea, 'keyup', '"')
        expect(emitted.join('')).toBe(prefix + '“”'.slice(0, index + 1))
      }
    }
  )

  it('does not consume the following ordinary key after a text-before-keydown quote', async () => {
    const { textarea, emitted } = await openTerminal('com.apple.inputmethod.SCIM.Shuangpin', false)
    nativeInsert(textarea, '“')
    key(textarea, 'keydown', '"', 229)
    key(textarea, 'keyup', '"')
    const down = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      bubbles: true,
      cancelable: true
    })
    textarea.dispatchEvent(down)
    if (!down.defaultPrevented) {
      textarea.dispatchEvent(
        new KeyboardEvent('keypress', {
          key: 'a',
          code: 'KeyA',
          charCode: 97,
          bubbles: true
        })
      )
      nativeInsert(textarea, 'a')
    }
    expect(emitted.join('')).toBe('“a')
  })

  it('does not duplicate punctuation already sent by an unmatched keypress', async () => {
    const { textarea, emitted } = await openTerminal('com.apple.inputmethod.SCIM.Shuangpin', false)
    key(textarea, 'keypress', '“', 8220)
    nativeInsert(textarea, '“')
    key(textarea, 'keyup', '"')
    expect(emitted.join('')).toBe('“')
  })

  it('leaves punctuation inside an active composition with the composition owner', async () => {
    const { textarea, emitted } = await openTerminal('com.apple.inputmethod.SCIM.Shuangpin', true)
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    nativeInsert(textarea, '“')
    expect(emitted).toEqual([])
    const end = new CompositionEvent('compositionend', { bubbles: true })
    Object.defineProperty(end, 'data', { value: '“' })
    textarea.dispatchEvent(end)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(emitted.join('')).toBe('“')
  })

  it('forwards text-before-keydown quotes even while the source probe has no result', async () => {
    const { textarea, emitted } = await openTerminal(null, true)
    for (const glyph of ['“', '”']) {
      nativeInsert(textarea, glyph)
      key(textarea, 'keydown', '"', 229)
      key(textarea, 'keyup', '"')
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(emitted.join('')).toBe('“”')
  })

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
