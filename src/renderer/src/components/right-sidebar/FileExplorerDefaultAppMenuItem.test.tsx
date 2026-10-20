// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TreeNode } from './file-explorer-types'

const { guard, openFilePath, errorToast } = vi.hoisted(() => ({
  guard: vi.fn(),
  openFilePath: vi.fn(),
  errorToast: vi.fn()
}))
vi.mock('./file-explorer-operation-owner', () => ({
  requireMatchingFileExplorerOperationRoute: guard
}))
vi.mock('sonner', () => ({ toast: { error: errorToast } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenuItem: ({ onSelect, children }: { onSelect: () => void; children: ReactNode }) => (
    <button onClick={onSelect}>{children}</button>
  )
}))

import { FileExplorerDefaultAppMenuItem } from './FileExplorerDefaultAppMenuItem'

const node: TreeNode = {
  name: 'report.pdf',
  path: '/project/report.pdf',
  relativePath: 'report.pdf',
  isDirectory: false,
  depth: 0,
  operationOwner: { kind: 'local' }
}

beforeEach(() => {
  vi.resetAllMocks()
  openFilePath.mockResolvedValue(true)
  vi.stubGlobal('__ORCA_WEB_CLIENT__', false)
  window.api = { shell: { openFilePath } } as unknown as Window['api']
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mount(
  overrides: Partial<React.ComponentProps<typeof FileExplorerDefaultAppMenuItem>> = {}
): void {
  render(
    <FileExplorerDefaultAppMenuItem
      node={node}
      worktreeId="folder-or-worktree"
      selectionSize={1}
      remote={false}
      {...overrides}
    />
  )
}

it.each(['/project/设备指纹/report #1.pdf', 'C:\\Projects\\设备指纹\\report #1.pdf'])(
  'opens the exact file path with the OS default application: %s',
  async (path) => {
    mount({ node: { ...node, path } })
    fireEvent.click(screen.getByRole('button', { name: 'Open with Default App' }))
    await waitFor(() => expect(openFilePath).toHaveBeenCalledWith(path))
    expect(guard).toHaveBeenCalledWith('folder-or-worktree', { kind: 'local' })
    expect(errorToast).not.toHaveBeenCalled()
  }
)

it.each([
  { node: { ...node, isDirectory: true } },
  { node: { ...node, operationOwner: undefined } },
  { node: { ...node, operationOwner: { kind: 'unresolved' as const } } },
  { node: { ...node, operationOwner: { kind: 'ssh' as const, connectionId: 'server' } } },
  {
    node: {
      ...node,
      operationOwner: {
        kind: 'runtime' as const,
        environmentId: 'remote',
        executionHostId: 'runtime:remote' as const
      }
    }
  },
  { remote: true },
  { selectionSize: 2 },
  { worktreeId: null }
])('hides the action for unsupported contexts: %j', (overrides) => {
  mount(overrides)
  expect(screen.queryByRole('button')).toBeNull()
  expect(openFilePath).not.toHaveBeenCalled()
})

it('hides the desktop action in the web client', () => {
  vi.stubGlobal('__ORCA_WEB_CLIENT__', true)
  mount()
  expect(screen.queryByRole('button')).toBeNull()
})

it('rejects a stale local node if its workspace owner changed before selection', async () => {
  mount()
  guard.mockImplementation(() => {
    throw new Error('Workspace owner changed')
  })
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(errorToast).toHaveBeenCalled())
  expect(openFilePath).not.toHaveBeenCalled()
})

it.each(['reported', 'rejected'])('shows a failure when opening is %s', async (failure) => {
  if (failure === 'reported') {
    openFilePath.mockResolvedValue(false)
  } else {
    openFilePath.mockRejectedValue(new Error('Application unavailable'))
  }
  mount()
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(errorToast).toHaveBeenCalledOnce())
})
