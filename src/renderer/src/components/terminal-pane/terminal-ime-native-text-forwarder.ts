import type { IDisposable } from '@xterm/xterm'
import {
  DISABLED_MAC_NATIVE_TEXT_INPUT_SOURCE_FEATURES,
  type MacNativeTextInputSourceFeatures
} from './terminal-ime-input-source'
import {
  isImeNativeTextCommitCandidate,
  isImeNativeTextKeydownCandidate,
  isSinglePrintableTextKey,
  type ImeNativeTextKeyEvent
} from './terminal-ime-native-text-candidates'

// Why: some macOS input sources and synthetic Unicode injectors commit native
// text through a plain `insertText` event after a printable keydown. Xterm's
// kitty keyboard protocol can encode and cancel that keydown before Chromium
// commits the real text, so this narrowly bypasses known native-text candidates
// and forwards the committed glyph from the input event straight to the PTY.

type ClaimedKeyPress = {
  key: string
  code?: string
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock'])

export const XTERM_COMPOSITION_TRANSACTION_ACCEPTED_EVENT = 'xterm-composition-transaction-accepted'
export const XTERM_COMPOSITION_TRANSACTION_SETTLED_EVENT = 'xterm-composition-transaction-settled'

export type TerminalImeNativeTextForwarder = IDisposable & {
  /**
   * Returns true when this keyboard event belongs to a direct native text
   * commit and should bypass xterm (the caller should return `false` from
   * `attachCustomKeyEventHandler`). The committed glyph is forwarded later from
   * the `input` event via the `sendInput` dependency.
   */
  claimKeyEvent: (event: ImeNativeTextKeyEvent) => boolean
}

function matchesClaimedPress(event: ImeNativeTextKeyEvent, claimedPress: ClaimedKeyPress): boolean {
  if (event.code && claimedPress.code) {
    return event.code === claimedPress.code
  }
  return event.key === claimedPress.key
}

function matchesClaimedKeypress(
  event: ImeNativeTextKeyEvent,
  claimedPress: ClaimedKeyPress
): boolean {
  if (matchesClaimedPress(event, claimedPress)) {
    return true
  }
  if (event.code && claimedPress.code) {
    return false
  }
  // Why: IME/native-text keypresses can carry the transformed glyph and omit
  // physical `code`; keep xterm silent until the input event forwards the text.
  return isSinglePrintableTextKey(event.key)
}

export function installTerminalImeNativeTextForwarder(args: {
  terminalElement: HTMLElement | null | undefined
  isComposing: () => boolean
  sendInput: (data: string) => void
  getInputSourceFeatures?: () => MacNativeTextInputSourceFeatures
}): TerminalImeNativeTextForwarder {
  if (!args.terminalElement) {
    return {
      claimKeyEvent: () => false,
      dispose: () => undefined
    }
  }

  const terminalElement = args.terminalElement
  let pendingForward = false
  let pendingForwardClearTimer: number | null = null
  let compositionTransactionPending = false
  let claimedPress: ClaimedKeyPress | null = null
  let nativeTextKeydownPending = false
  let nativeTextKeypressPending = false
  let forwardingBeforeKeydown = false
  let earlyCommitAwaitingKeydown = false

  const clearPendingForwardTimer = (): void => {
    if (pendingForwardClearTimer !== null) {
      window.clearTimeout(pendingForwardClearTimer)
      pendingForwardClearTimer = null
    }
  }

  const disarmPendingForward = (): void => {
    clearPendingForwardTimer()
    pendingForward = false
    forwardingBeforeKeydown = false
  }

  const schedulePendingForwardClear = (): void => {
    clearPendingForwardTimer()
    // Why: some macOS IMEs deliver keyup before the final insertText event;
    // keep the native commit armed briefly, then drop genuinely stray inserts.
    pendingForwardClearTimer = window.setTimeout(() => {
      pendingForward = false
      pendingForwardClearTimer = null
    }, 100)
  }

  const markCompositionTransactionAccepted = (): void => {
    compositionTransactionPending = true
  }

  const markCompositionTransactionSettled = (): void => {
    compositionTransactionPending = false
  }

  const claimKeyEvent = (event: ImeNativeTextKeyEvent): boolean => {
    if (event.type === 'keydown') {
      if (
        !isImeNativeTextKeydownCandidate(
          event,
          args.isComposing(),
          args.getInputSourceFeatures?.() ?? DISABLED_MAC_NATIVE_TEXT_INPUT_SOURCE_FEATURES
        )
      ) {
        if (!MODIFIER_KEYS.has(event.key)) {
          earlyCommitAwaitingKeydown = false
        }
        return false
      }
      claimedPress = { key: event.key, code: event.code }
      if (earlyCommitAwaitingKeydown) {
        earlyCommitAwaitingKeydown = false
        disarmPendingForward()
        return true
      }
      // Arm forwarding so the upcoming input event is sent to the PTY.
      clearPendingForwardTimer()
      pendingForward = true
      forwardingBeforeKeydown = false
      return true
    }
    if (!claimedPress) {
      return false
    }
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing === true) {
      return false
    }
    if (event.type === 'keyup') {
      if (!matchesClaimedPress(event, claimedPress)) {
        return false
      }
      claimedPress = null
      if (pendingForward) {
        schedulePendingForwardClear()
      }
      // Bypass so the kitty release sequence for the swallowed press cannot leak.
      return true
    }
    if (event.type === 'keypress') {
      // Keep the keydown's armed state but still bypass xterm so it does not
      // double-send printable text before our input forward runs.
      return matchesClaimedKeypress(event, claimedPress)
    }
    return false
  }

  const observeKeyboardEvent = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || MODIFIER_KEYS.has(event.key)) {
      return
    }
    if (event.type === 'keydown') {
      nativeTextKeydownPending = true
    } else if (event.type === 'keypress') {
      nativeTextKeypressPending = true
    } else if (event.type === 'keyup') {
      nativeTextKeydownPending = false
      nativeTextKeypressPending = false
    }
  }

  const prepareEarlyNativeCommit = (event: Event): void => {
    if (
      !(event instanceof InputEvent) ||
      event.defaultPrevented ||
      event.inputType !== 'insertText' ||
      !event.data ||
      event.isComposing ||
      args.isComposing() ||
      compositionTransactionPending ||
      pendingForward ||
      nativeTextKeydownPending ||
      nativeTextKeypressPending ||
      !isImeNativeTextCommitCandidate(
        event.data,
        args.getInputSourceFeatures?.() ?? DISABLED_MAC_NATIVE_TEXT_INPUT_SOURCE_FEATURES
      )
    ) {
      return
    }
    // macOS WebKit can commit IME punctuation before delivering its 229 keydown.
    clearPendingForwardTimer()
    pendingForward = true
    forwardingBeforeKeydown = true
  }

  const forwardCommittedText = (event: Event): void => {
    if (!(event instanceof InputEvent)) {
      return
    }
    if (compositionTransactionPending && event.inputType === 'insertText') {
      disarmPendingForward()
      event.stopImmediatePropagation()
      return
    }
    if (!pendingForward) {
      return
    }
    if (event.inputType !== 'insertText') {
      disarmPendingForward()
      return
    }
    const committedBeforeKeydown = forwardingBeforeKeydown
    disarmPendingForward()
    if (event.data) {
      earlyCommitAwaitingKeydown = committedBeforeKeydown
      args.sendInput(event.data)
    }
    event.stopImmediatePropagation()
    // Clear the helper textarea so the native glyph doesn't accumulate;
    // safe in practice since only synthetic injectors interleave commits.
    if (event.target instanceof HTMLTextAreaElement) {
      event.target.value = ''
    }
  }

  const cancelPending = (): void => {
    disarmPendingForward()
    compositionTransactionPending = false
    claimedPress = null
    nativeTextKeydownPending = false
    nativeTextKeypressPending = false
    earlyCommitAwaitingKeydown = false
  }

  terminalElement.addEventListener(
    XTERM_COMPOSITION_TRANSACTION_ACCEPTED_EVENT,
    markCompositionTransactionAccepted,
    true
  )
  terminalElement.addEventListener(
    XTERM_COMPOSITION_TRANSACTION_SETTLED_EVENT,
    markCompositionTransactionSettled,
    true
  )
  terminalElement.addEventListener('input', forwardCommittedText, true)
  terminalElement.addEventListener('beforeinput', prepareEarlyNativeCommit, true)
  for (const type of ['keydown', 'keypress', 'keyup']) {
    terminalElement.addEventListener(type, observeKeyboardEvent, true)
  }
  terminalElement.addEventListener('blur', cancelPending, true)

  return {
    claimKeyEvent,
    dispose: () => {
      cancelPending()
      terminalElement.removeEventListener(
        XTERM_COMPOSITION_TRANSACTION_ACCEPTED_EVENT,
        markCompositionTransactionAccepted,
        true
      )
      terminalElement.removeEventListener(
        XTERM_COMPOSITION_TRANSACTION_SETTLED_EVENT,
        markCompositionTransactionSettled,
        true
      )
      terminalElement.removeEventListener('input', forwardCommittedText, true)
      terminalElement.removeEventListener('beforeinput', prepareEarlyNativeCommit, true)
      for (const type of ['keydown', 'keypress', 'keyup']) {
        terminalElement.removeEventListener(type, observeKeyboardEvent, true)
      }
      terminalElement.removeEventListener('blur', cancelPending, true)
    }
  }
}
