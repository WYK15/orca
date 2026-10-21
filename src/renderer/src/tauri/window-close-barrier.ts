import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../../../shared/renderer-shutdown-events'

export function createWindowCloseBarrier(
  target: EventTarget,
  flush: () => Promise<void>,
  destroy: () => Promise<void>,
  onError: (error: unknown) => void
): () => Promise<void> {
  const save = createWindowSaveBarrier(target, flush, onError)
  return () => save(destroy)
}

export function createWindowSaveBarrier(
  target: EventTarget,
  flush: () => Promise<void>,
  onError: (error: unknown) => void
): (action: () => Promise<void>) => Promise<void> {
  let closing = false
  return async (action) => {
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
      await action()
    } catch (error) {
      target.dispatchEvent(new Event(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT))
      onError(error)
    } finally {
      closing = false
    }
  }
}
