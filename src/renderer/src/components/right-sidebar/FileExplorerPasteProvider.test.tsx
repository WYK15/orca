// @vitest-environment happy-dom
import { useRef } from 'react'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileExplorerPasteProvider } from './FileExplorerPasteProvider'
import { FileExplorerBackgroundMenu } from './FileExplorerBackgroundMenu'
import type { TreeNode } from './file-explorer-types'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  import: vi.fn(),
  capture: vi.fn(),
  guard: vi.fn(),
  refresh: vi.fn(),
  select: vi.fn(),
  info: vi.fn(),
  error: vi.fn()
}))
vi.mock('@/runtime/runtime-file-client', () => ({ importExternalPathsToRuntime: mocks.import }))
vi.mock('./file-explorer-operation-owner', () => ({
  captureFileExplorerOperationGuard: mocks.capture
}))
vi.mock('sonner', () => ({
  toast: {
    info: mocks.info,
    error: mocks.error,
    loading: vi.fn(),
    dismiss: vi.fn()
  }
}))
const owner = { kind: 'local' } as const
const folder: TreeNode = {
  name: 'target',
  path: '/project/target',
  relativePath: 'target',
  isDirectory: true,
  depth: 0,
  operationOwner: owner
}
const clipboard = ['/external/中文 图片.png', '/external/a folder']

function Harness({
  project = 'project',
  selected = folder,
  enabled = true,
  menu = false
}: {
  project?: string
  selected?: TreeNode | null
  enabled?: boolean
  menu?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  return (
    <>
      <FileExplorerPasteProvider
        containerRef={container}
        worktreePath={`/${project}`}
        activeWorktreeId={project}
        operationOwner={owner}
        selectedNode={selected}
        enabled={enabled}
        refreshDir={mocks.refresh}
        setSelectedPath={mocks.select}
      >
        <div ref={container} tabIndex={0}>
          <button>file row</button>
          <input aria-label="rename" />
          <div data-ignore-file-explorer-keys="true">
            <button>ignored action</button>
          </div>
        </div>
        {menu && (
          <FileExplorerBackgroundMenu
            refresh={{ isRefreshing: false, showRefreshSpinner: false, handleRefresh: vi.fn() }}
            open
            onOpenChange={() => {}}
            point={{ x: 0, y: 0 }}
            worktreePath={`/${project}`}
            onStartNew={() => {}}
          />
        )}
      </FileExplorerPasteProvider>
      <textarea aria-label="terminal" />
    </>
  )
}

function paste(target: HTMLElement): boolean {
  target.focus()
  return fireEvent.keyDown(target, { key: 'v', metaKey: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Macintosh')
  Object.assign(window, { api: { ui: { readClipboardFiles: mocks.read } } })
  mocks.read.mockResolvedValue(clipboard)
  mocks.capture.mockReturnValue({
    route: {
      settings: { activeRuntimeEnvironmentId: null },
      expectedExecutionHostId: 'local'
    },
    assertCurrent: mocks.guard
  })
  mocks.import.mockResolvedValue({
    results: [{ status: 'imported', destPath: '/project/target/中文 图片.png' }]
  })
  mocks.refresh.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('file explorer file paste', () => {
  it('pastes all native file references into the selected folder and refreshes its contents', async () => {
    const view = render(<Harness />)
    expect(paste(view.getByText('file row'))).toBe(false)
    await waitFor(() => expect(mocks.select).toHaveBeenCalledWith('/project/target/中文 图片.png'))
    expect(mocks.capture).toHaveBeenCalledWith('project', owner)
    expect(mocks.import).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'project',
        worktreePath: '/project',
        expectedExecutionHostId: 'local'
      }),
      clipboard,
      '/project/target',
      expect.objectContaining({ assertCurrent: expect.any(Function) })
    )
    expect(mocks.refresh).toHaveBeenCalledWith('/project/target')
  })

  it.each([null, { ...folder, path: '/project/readme.md', isDirectory: false }])(
    'uses the project root or the selected file parent',
    async (selected) => {
      const view = render(<Harness selected={selected} />)
      paste(view.getByText('file row'))
      await waitFor(() => expect(mocks.import).toHaveBeenCalled())
      expect(mocks.import.mock.calls[0][2]).toBe('/project')
    }
  )

  it('provides Paste in the background menu and uses its root rather than the selected folder', async () => {
    const view = render(<Harness menu />)
    const item = await view.findByRole('menuitem', { name: /Paste|粘贴/ })
    fireEvent.click(item)
    await waitFor(() => expect(mocks.import).toHaveBeenCalled())
    expect(mocks.import.mock.calls[0][2]).toBe('/project')
  })

  it('ignores text inputs, terminal focus, excluded controls and hidden file views', () => {
    const view = render(<Harness />)
    for (const target of [
      view.getByLabelText('rename'),
      view.getByLabelText('terminal'),
      view.getByText('ignored action')
    ]) {
      expect(paste(target)).toBe(true)
    }
    view.rerender(<Harness enabled={false} />)
    expect(paste(view.getByText('file row'))).toBe(true)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('uses Ctrl+V on non-Mac platforms', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows')
    const view = render(<Harness />)
    const target = view.getByText('file row')
    expect(paste(target)).toBe(true)
    target.focus()
    expect(fireEvent.keyDown(target, { key: 'v', ctrlKey: true })).toBe(false)
    await waitFor(() => expect(mocks.import).toHaveBeenCalledTimes(1))
  })

  it('does not import text-only clipboard content', async () => {
    mocks.read.mockResolvedValue([])
    const view = render(<Harness />)
    paste(view.getByText('file row'))
    await waitFor(() => expect(mocks.info).toHaveBeenCalled())
    expect(mocks.import).not.toHaveBeenCalled()
  })

  it('rejects a selected folder left over from the previous workspace', async () => {
    const view = render(<Harness project="other" />)
    paste(view.getByText('file row'))
    await act(async () => {})
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.import).not.toHaveBeenCalled()
  })

  it('ignores paste when the host has no file clipboard capability', () => {
    Object.assign(window, { api: { ui: {} } })
    const view = render(<Harness />)
    expect(paste(view.getByText('file row'))).toBe(true)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it.each(['switch', 'unmount'])('cancels an in-flight clipboard read after %s', async (action) => {
    let resolve!: (paths: string[]) => void
    mocks.read.mockReturnValue(
      new Promise<string[]>((done) => {
        resolve = done
      })
    )
    const view = render(<Harness />)
    paste(view.getByText('file row'))
    if (action === 'switch') {
      view.rerender(<Harness project="other" />)
    } else {
      view.unmount()
    }
    await act(async () => {
      resolve(clipboard)
    })
    expect(mocks.import).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('does not duplicate an operation if keyboard and native paste events arrive together', async () => {
    let resolve!: (paths: string[]) => void
    mocks.read.mockReturnValue(
      new Promise<string[]>((done) => {
        resolve = done
      })
    )
    const view = render(<Harness />)
    const target = view.getByText('file row')
    paste(target)
    paste(target)
    fireEvent.paste(target)
    expect(mocks.read).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve(clipboard)
    })
    expect(mocks.import).toHaveBeenCalledTimes(1)
  })

  it('retains SSH host expectations instead of falling back to local files', async () => {
    mocks.capture.mockReturnValue({
      route: {
        settings: { activeRuntimeEnvironmentId: null },
        connectionId: 'ssh-host',
        expectedExecutionHostId: 'ssh:ssh-host',
        expectedSshTargetId: 'ssh-host',
        expectedSshConnectionGeneration: 7
      },
      assertCurrent: mocks.guard
    })
    const view = render(<Harness />)
    paste(view.getByText('file row'))
    await waitFor(() => expect(mocks.import).toHaveBeenCalled())
    expect(mocks.import.mock.calls[0][0]).toMatchObject({
      connectionId: 'ssh-host',
      expectedSshTargetId: 'ssh-host',
      expectedSshConnectionGeneration: 7
    })
  })

  it('rejects stale ownership before importing and surfaces the error', async () => {
    mocks.guard.mockImplementationOnce(() => {
      throw new Error('Owner changed')
    })
    const view = render(<Harness />)
    paste(view.getByText('file row'))
    await waitFor(() => expect(mocks.error).toHaveBeenCalled())
    expect(mocks.import).not.toHaveBeenCalled()
  })
})
