import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AppState } from '@/store'
import { createEditorSlice } from '@/store/slices/editor'
import { attachEditorAutosaveController } from './editor-autosave-controller'
import { requestEditorFileSave, ORCA_EDITOR_SAVE_AND_CLOSE_EVENT } from './editor-autosave'
import { registerPendingEditorFlush } from './editor-pending-flush'
import { stageMarkdownSaveRecovery, resolveMarkdownSaveRecovery } from './markdown-save-recovery'

vi.mock('@/lib/connection-context', () => ({ getConnectionIdForFile: () => undefined }))

function createStoreWithDocument(): StoreApi<AppState> {
  const store = createStore<AppState>(
    (set, get, api) =>
      ({
        activeWorktreeId: 'wt',
        settings: { editorAutoSave: true, editorAutoSaveDelayMs: 1000 },
        repos: [],
        folderWorkspaces: [],
        worktreesByRepo: { repo: [{ id: 'wt', repoId: 'repo', path: '/repo', hostId: 'local' }] },
        detectedWorktreesByRepo: {},
        runtimeEnvironments: [],
        runtimeEnvironmentCatalogHydrated: true,
        removedRuntimeEnvironmentIds: new Set(),
        sshConnectionStates: new Map(),
        sshStateByEnvironment: new Map(),
        ...createEditorSlice(set, get, api)
      }) as unknown as AppState
  )
  store.getState().openFile({
    filePath: '/repo/guide.md',
    relativePath: 'guide.md',
    worktreeId: 'wt',
    language: 'markdown',
    mode: 'edit'
  })
  store.getState().setEditorDraft('/repo/guide.md', 'safe source')
  store.getState().markFileDirty('/repo/guide.md', true)
  return store
}

describe('Markdown recovery at disk save boundaries', () => {
  const writeFile = vi.fn()
  let detach: (() => void) | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    writeFile.mockReset().mockResolvedValue(undefined)
    const target = new EventTarget()
    vi.stubGlobal('window', {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: { fs: { writeFile } }
    })
  })
  afterEach(() => {
    detach?.()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('blocks autosave, explicit save and save-and-close until the draft is approved', async () => {
    const store = createStoreWithDocument()
    store.setState((state) =>
      stageMarkdownSaveRecovery(state, '/repo/guide.md', 'draft', 'safe source')
    )
    detach = attachEditorAutosaveController(store)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(requestEditorFileSave({ fileId: '/repo/guide.md' })).rejects.toThrow(
      'saving is paused'
    )
    window.dispatchEvent(
      new CustomEvent(ORCA_EDITOR_SAVE_AND_CLOSE_EVENT, {
        detail: { fileId: '/repo/guide.md' }
      })
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(writeFile).not.toHaveBeenCalled()
    expect(store.getState().openFiles).toHaveLength(1)
    expect(store.getState().editorDrafts['/repo/guide.md']).toBe('draft')

    store.setState((state) => resolveMarkdownSaveRecovery(state, '/repo/guide.md', 'accept'))
    await requestEditorFileSave({ fileId: '/repo/guide.md' })
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/repo/guide.md', content: 'draft' })
    )
  })

  it('flushes pending rich edits before an already scheduled autosave can write', async () => {
    const store = createStoreWithDocument()
    detach = attachEditorAutosaveController(store)
    const unregister = registerPendingEditorFlush('/repo/guide.md', () => {
      store.setState((state) =>
        stageMarkdownSaveRecovery(state, '/repo/guide.md', 'pending draft', 'safe source')
      )
    })
    try {
      await vi.advanceTimersByTimeAsync(1000)
      expect(writeFile).not.toHaveBeenCalled()
      expect(store.getState().editorDrafts['/repo/guide.md']).toBe('pending draft')
      expect(store.getState().openFiles[0].isDirty).toBe(true)
    } finally {
      unregister()
    }
  })

  it('restores a blocked draft after restart and keeps it dirty and unsaved', async () => {
    const store = createStoreWithDocument()
    store.getState().hydrateEditorSession({
      activeRepoId: null,
      activeWorktreeId: 'wt',
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      openFilesByWorktree: {
        wt: [
          {
            filePath: '/repo/guide.md',
            relativePath: 'guide.md',
            worktreeId: 'wt',
            language: 'markdown',
            dirtyDraftContent: 'recovered draft',
            markdownSaveRecovery: { source: 'safe source' }
          }
        ]
      }
    })
    store.getState().markFileDirty('/repo/guide.md', false)
    detach = attachEditorAutosaveController(store)
    await vi.advanceTimersByTimeAsync(2000)
    expect(writeFile).not.toHaveBeenCalled()
    expect(store.getState().editorDrafts['/repo/guide.md']).toBe('recovered draft')
    expect(store.getState().openFiles[0]).toMatchObject({
      isDirty: true,
      markdownSaveRecovery: { source: 'safe source' }
    })
  })
})
