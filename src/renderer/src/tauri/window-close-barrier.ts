import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../../../shared/renderer-shutdown-events'

export function createWindowCloseBarrier(
  target: EventTarget,
  flush: () => Promise<void>,
  destroy: () => Promise<void>,
  onError: (error: unknown) => void
): () => Promise<void> {
  let closing = false
  return async () => {
    if (closing) {
      return
    }
    closing = true
    try {
      if (!target.dispatchEvent(new Event('beforeunload', { cancelable: true }))) {
        target.dispatchEvent(new Event(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT))
        return
      }
      await flush()
      await destroy()
    } catch (error) {
      target.dispatchEvent(new Event(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT))
      onError(error)
    } finally {
      closing = false
    }
  }
}
