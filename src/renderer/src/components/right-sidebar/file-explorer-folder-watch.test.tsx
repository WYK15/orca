// @vitest-environment happy-dom
import { useEffect, useState } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { useEditorExternalWatch } from '@/hooks/useEditorExternalWatch'
import { useFileExplorerTree } from './useFileExplorerTree'
import { useFileExplorerWatch } from './useFileExplorerWatch'
import { joinPath } from '@/lib/path'
import type { DirEntry, FsChangedPayload, FolderWorkspace } from '../../../../shared/types'

const disk = vi.hoisted(() => new Map<string, DirEntry[]>())
vi.mock('./file-explorer-directory-listing', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  readFileExplorerDirectory: async (_id: string, _root: string, directory: string) => ({
    entries: disk.get(directory) ?? [],
    operationOwner: { kind: 'local' }
  })
}))

const initial = useAppStore.getState()
const listeners = new Set<(payload: FsChangedPayload) => void>()
const watches = new Set<string>()
const folder = {
  id: 'notes',
  name: 'Notes',
  folderPath: '/project',
  projectGroupId: 'group',
  executionHostId: 'local'
} as FolderWorkspace

function useFolderTree() {
  useEditorExternalWatch()
  const expanded = new Set(['/project/nested'])
  const tree = useFileExplorerTree('/project', expanded, 'folder:notes')
  const { resetAndLoad } = tree
  const [, setSelectedPath] = useState<string | null>(null)
  useFileExplorerWatch({
    worktreePath: '/project',
    activeWorktreeId: 'folder:notes',
    dirCache: tree.dirCache,
    setDirCache: tree.setDirCache,
    expanded,
    setSelectedPath,
    refreshDir: tree.refreshDir,
    refreshTree: tree.refreshTree,
    inlineInput: null,
    dragSourcePath: null,
    isNativeDragOver: false,
    operationOwner: tree.rootCache?.operationOwner
  })
  useEffect(() => {
    void resetAndLoad()
  }, [resetAndLoad])
  return tree
}

function emit(events: FsChangedPayload['events']) {
  if (watches.has('/project')) {
    for (const listener of listeners) {
      listener({ worktreePath: '/project', events })
    }
  }
}

beforeEach(() => {
  disk.clear()
  disk.set('/project', [{ name: 'nested', isDirectory: true, isSymlink: false }])
  watches.clear()
  listeners.clear()
  vi.stubGlobal('api', undefined)
  Object.assign(window, {
    api: {
      fs: {
        watchWorktree: vi.fn(async ({ worktreePath }) => {
          watches.add(worktreePath)
        }),
        unwatchWorktree: vi.fn(async ({ worktreePath }) => {
          watches.delete(worktreePath)
        }),
        onFsChanged: (handler: (payload: FsChangedPayload) => void) => {
          listeners.add(handler)
          return () => {
            listeners.delete(handler)
          }
        }
      }
    }
  })
  useAppStore.setState({
    repos: [],
    worktreesByRepo: {},
    detectedWorktreesByRepo: {},
    folderWorkspaces: [folder],
    projectGroups: [],
    openFiles: [],
    activeWorktreeId: 'folder:notes',
    activeWorkspaceExecutionHostId: 'local',
    rightSidebarOpen: true,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    settings: initial.settings ? { ...initial.settings, activeRuntimeEnvironmentId: null } : null
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial)
  vi.unstubAllGlobals()
})

describe('folder explorer external changes', () => {
  it('updates root and expanded child listings without switching projects', async () => {
    const view = renderHook(useFolderTree)
    await waitFor(() => expect(watches.has('/project')).toBe(true))
    await waitFor(() => expect(view.result.current.rootCache?.children).toHaveLength(1))
    await act(async () => {
      await view.result.current.loadDir('/project/nested', 1)
    })
    for (const directory of ['/project', '/project/nested']) {
      const existing = disk.get(directory) ?? []
      const path = joinPath(directory, 'new.txt')
      disk.set(directory, [...existing, { name: 'new.txt', isDirectory: false, isSymlink: false }])
      act(() => emit([{ kind: 'create', absolutePath: path, isDirectory: false }]))
      await waitFor(() =>
        expect(view.result.current.dirCache[directory].children.map((n) => n.name)).toContain(
          'new.txt'
        )
      )
      disk.set(directory, [
        ...existing,
        { name: 'renamed.txt', isDirectory: false, isSymlink: false }
      ])
      act(() =>
        emit([
          { kind: 'delete', absolutePath: path },
          { kind: 'create', absolutePath: joinPath(directory, 'renamed.txt'), isDirectory: false }
        ])
      )
      await waitFor(() => {
        const names = view.result.current.dirCache[directory].children.map((n) => n.name)
        expect(names).toContain('renamed.txt')
        expect(names).not.toContain('new.txt')
      })
      disk.set(directory, existing)
      act(() => emit([{ kind: 'delete', absolutePath: joinPath(directory, 'renamed.txt') }]))
      await waitFor(() =>
        expect(view.result.current.dirCache[directory].children.map((n) => n.name)).not.toContain(
          'renamed.txt'
        )
      )
    }
  })
})
