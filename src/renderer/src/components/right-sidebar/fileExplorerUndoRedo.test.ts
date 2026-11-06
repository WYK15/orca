import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearFileExplorerUndoHistory,
  commitFileExplorerOp,
  undoFileExplorer,
  redoFileExplorer,
  fileExplorerHasUndo,
  fileExplorerHasRedo
} from './fileExplorerUndoRedo'

beforeEach(clearFileExplorerUndoHistory)

describe('file explorer mutation history', () => {
  it('keeps a failed undo available for retry', async () => {
    const undo = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValue(undefined)
    commitFileExplorerOp({ undo, redo: vi.fn() })
    await expect(undoFileExplorer()).rejects.toThrow('temporarily unavailable')
    expect(fileExplorerHasUndo()).toBe(true)
    expect(fileExplorerHasRedo()).toBe(false)
    await expect(undoFileExplorer()).resolves.toBe(true)
    expect(undo).toHaveBeenCalledTimes(2)
  })

  it('keeps a failed redo available for retry', async () => {
    const redo = vi
      .fn()
      .mockRejectedValueOnce(new Error('name collision'))
      .mockResolvedValue(undefined)
    commitFileExplorerOp({ undo: vi.fn(), redo })
    await undoFileExplorer()
    await expect(redoFileExplorer()).rejects.toThrow('name collision')
    expect(fileExplorerHasRedo()).toBe(true)
    await expect(redoFileExplorer()).resolves.toBe(true)
  })

  it('keeps a failed undo below a new operation completed while it was pending', async () => {
    let fail!: (reason: Error) => void
    const older = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            fail = reject
          })
      )
      .mockResolvedValue(undefined)
    const newer = vi.fn()
    commitFileExplorerOp({ undo: older, redo: vi.fn() })
    const pending = undoFileExplorer()
    commitFileExplorerOp({ undo: newer, redo: vi.fn() })
    fail(new Error('unavailable'))
    await expect(pending).rejects.toThrow('unavailable')
    await undoFileExplorer()
    expect(newer).toHaveBeenCalledOnce()
    await expect(undoFileExplorer()).resolves.toBe(true)
    expect(older).toHaveBeenCalledTimes(2)
  })

  it('does not run two file mutations concurrently when undo is repeated', async () => {
    let finish!: () => void
    const older = vi.fn()
    const newest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    commitFileExplorerOp({ undo: older, redo: vi.fn() })
    commitFileExplorerOp({ undo: newest, redo: vi.fn() })
    const first = undoFileExplorer()
    await expect(undoFileExplorer()).resolves.toBe(false)
    expect(older).not.toHaveBeenCalled()
    finish()
    await first
    await expect(undoFileExplorer()).resolves.toBe(true)
    expect(older).toHaveBeenCalledOnce()
  })

  it('does not restore redo history after a new operation or explicit clear', async () => {
    let finish!: () => void
    commitFileExplorerOp({
      undo: () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
      redo: vi.fn()
    })
    const undoing = undoFileExplorer()
    commitFileExplorerOp({ undo: vi.fn(), redo: vi.fn() })
    clearFileExplorerUndoHistory()
    finish()
    await undoing
    expect(fileExplorerHasRedo()).toBe(false)
    expect(fileExplorerHasUndo()).toBe(false)
  })

  it('replays successful operations in order and discards redo after a new operation', async () => {
    const changes: string[] = []
    for (const name of ['first', 'second']) {
      commitFileExplorerOp({
        undo: async () => {
          changes.push(`undo ${name}`)
        },
        redo: async () => {
          changes.push(`redo ${name}`)
        }
      })
    }
    await undoFileExplorer()
    await undoFileExplorer()
    await redoFileExplorer()
    expect(changes).toEqual(['undo second', 'undo first', 'redo first'])
    commitFileExplorerOp({ undo: vi.fn(), redo: vi.fn() })
    await expect(redoFileExplorer()).resolves.toBe(false)
  })
})
