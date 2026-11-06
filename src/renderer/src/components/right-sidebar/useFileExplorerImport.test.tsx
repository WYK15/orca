// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileExplorerImport } from './useFileExplorerImport'

const mocks = vi.hoisted(() => ({
  import: vi.fn(),
  capture: vi.fn(),
  assert: vi.fn(),
  error: vi.fn()
}))
vi.mock('@/runtime/runtime-file-client', () => ({ importExternalPathsToRuntime: mocks.import }))
vi.mock('./file-explorer-operation-owner', () => ({
  captureFileExplorerOperationGuard: mocks.capture
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))

type Drop = { target: string; paths: string[]; destinationDir: string }
let drop: (event: Drop) => void
const owner = { kind: 'local' } as const
const imported = { results: [{ status: 'imported', destPath: '/project/target/file.txt' }] }
const event = {
  target: 'file-explorer',
  paths: ['/external/file.txt'],
  destinationDir: '/project/target'
}

function options(root: string | null = '/project') {
  return {
    worktreePath: root,
    activeWorktreeId: root,
    operationOwner: owner,
    refreshDir: vi.fn(async () => {}),
    clearNativeDragState: vi.fn(),
    setSelectedPath: vi.fn()
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(window, {
    api: {
      ui: {
        onFileDrop: (listener: typeof drop) => {
          drop = listener
          return vi.fn()
        }
      }
    }
  })
  mocks.capture.mockReturnValue({
    route: { settings: { activeRuntimeEnvironmentId: null }, expectedExecutionHostId: 'local' },
    assertCurrent: mocks.assert
  })
  mocks.import.mockResolvedValue(imported)
})
afterEach(cleanup)

describe('native explorer file imports', () => {
  it('imports into the drop folder and refreshes and selects in the same workspace', async () => {
    const props = options()
    renderHook(() => useFileExplorerImport(props))
    act(() => drop(event))
    await waitFor(() =>
      expect(props.setSelectedPath).toHaveBeenCalledWith('/project/target/file.txt')
    )
    expect(props.refreshDir).toHaveBeenCalledWith('/project/target')
    expect(mocks.import.mock.calls[0][0]).toMatchObject({
      worktreeId: '/project',
      worktreePath: '/project'
    })
  })

  it.each(['switch', 'hide', 'unmount'])(
    'does not update another view after an import and %s',
    async (action) => {
      let finish!: (result: typeof imported) => void
      mocks.import.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        })
      )
      const original = options()
      const next = options('/other')
      const view = renderHook(useFileExplorerImport, { initialProps: original })
      act(() => drop(event))
      if (action === 'unmount') {
        view.unmount()
      } else if (action === 'hide') {
        view.rerender({ ...original, worktreePath: null })
      } else {
        view.rerender(next)
      }
      await act(async () => {
        finish(imported)
      })
      expect(original.refreshDir).not.toHaveBeenCalled()
      expect(original.setSelectedPath).not.toHaveBeenCalled()
      expect(next.refreshDir).not.toHaveBeenCalled()
      expect(next.setSelectedPath).not.toHaveBeenCalled()
    }
  )

  it('rejects a queued drop targeting the previous project', async () => {
    const view = renderHook(useFileExplorerImport, { initialProps: options() })
    view.rerender(options('/other'))
    act(() => drop(event))
    await act(async () => {})
    expect(mocks.import).not.toHaveBeenCalled()
  })

  it('aborts a staged import if its workspace changes before upload', () => {
    mocks.import.mockReturnValue(new Promise(() => {}))
    const view = renderHook(useFileExplorerImport, { initialProps: options() })
    act(() => drop(event))
    const check = mocks.import.mock.calls[0][3].assertCurrent
    view.rerender(options('/other'))
    expect(() => check()).toThrow()
  })

  it('does not select results after the owning host changes', async () => {
    let finish!: (result: typeof imported) => void
    mocks.import.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const props = options()
    renderHook(() => useFileExplorerImport(props))
    act(() => drop(event))
    mocks.assert.mockImplementation(() => {
      throw new Error('Owner changed')
    })
    await act(async () => {
      finish(imported)
    })
    expect(props.setSelectedPath).not.toHaveBeenCalled()
  })

  it('reports partial failure and keeps successful files selected', async () => {
    mocks.import.mockResolvedValue({
      results: [...imported.results, { status: 'failed', reason: 'denied' }]
    })
    const props = options()
    renderHook(() => useFileExplorerImport(props))
    act(() => drop(event))
    await waitFor(() => expect(mocks.error).toHaveBeenCalled())
    expect(props.setSelectedPath).toHaveBeenCalledWith('/project/target/file.txt')
  })
})
