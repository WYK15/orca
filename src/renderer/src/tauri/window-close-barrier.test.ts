import { describe, expect, it, vi } from 'vitest'
import { createWindowCloseBarrier, createWindowSaveBarrier } from './window-close-barrier'
import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../../../shared/renderer-shutdown-events'

describe('Tauri window close barrier', () => {
  it('prevents a close racing a reload while the captured draft is being saved', async () => {
    const target = new EventTarget()
    let complete: () => void = () => {}
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        })
    )
    const save = createWindowSaveBarrier(target, flush, vi.fn())
    const reload = vi.fn(async () => {})
    const destroy = vi.fn(async () => {})
    const pending = save(reload)
    await save(destroy)
    expect(flush).toHaveBeenCalledOnce()
    complete()
    await pending
    expect(reload).toHaveBeenCalledOnce()
    expect(destroy).not.toHaveBeenCalled()
  })
  it('captures state even on the landing page before saving and destroying', async () => {
    const target = new EventTarget()
    const order: string[] = []
    target.addEventListener('beforeunload', () => order.push('capture'))
    const close = createWindowCloseBarrier(
      target,
      async () => {
        order.push('save')
      },
      async () => {
        order.push('destroy')
      },
      vi.fn()
    )
    await close()
    expect(order).toEqual(['capture', 'save', 'destroy'])
  })

  it('keeps the window open and resets capture after a disk failure', async () => {
    const target = new EventTarget()
    const reset = vi.fn()
    target.addEventListener(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT, reset)
    const flush = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(null)
    const destroy = vi.fn()
    const report = vi.fn()
    const close = createWindowCloseBarrier(target, flush, destroy, report)
    await close()
    expect(destroy).not.toHaveBeenCalled()
    expect(reset).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalledOnce()
    await close()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('honors an editor save veto', async () => {
    const target = new EventTarget()
    target.addEventListener('beforeunload', (event) => event.preventDefault())
    const flush = vi.fn()
    const destroy = vi.fn()
    await createWindowCloseBarrier(target, flush, destroy, vi.fn())()
    expect(flush).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
  })
})
