import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ForkFeaturePolicy from '../../../../shared/fork-feature-policy'

const mocks = vi.hoisted(() => {
  const state = {
    activeWorktreeId: 'wt-first' as string | null,
    setActiveWorktree: vi.fn((id: string | null) => {
      state.activeWorktreeId = id
    }),
    shutdownWorktreeBrowsers: vi.fn().mockResolvedValue(undefined),
    shutdownWorktreeTerminals: vi.fn().mockResolvedValue(undefined)
  }
  return {
    state,
    activateAndRevealWorktree: vi.fn((id: string) => state.setActiveWorktree(id)),
    activateAndRevealFolderWorkspace: vi.fn(),
    resumeWorkspace: vi.fn(),
    suspendWorkspace: vi.fn(),
    listRuntimes: vi.fn(),
    cleanup: vi.fn(),
    toastError: vi.fn()
  }
})

vi.mock('../../../../shared/fork-feature-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof ForkFeaturePolicy>()),
  EXPERIMENTAL_FEATURES_ENABLED: false
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateAndRevealWorktree,
  activateAndRevealFolderWorkspace: mocks.activateAndRevealFolderWorkspace
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { cleanupEphemeralVmRuntimesForDeleted } from '@/lib/ephemeral-vm-runtime-cleanup'
import { runSleepWorktrees } from './sleep-worktree-flow'

describe('personal desktop workspace lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.activeWorktreeId = 'wt-first'
    for (const [method, invoke] of Object.entries({
      resumeWorkspace: mocks.resumeWorkspace,
      suspendWorkspace: mocks.suspendWorkspace,
      listRuntimes: mocks.listRuntimes,
      cleanup: mocks.cleanup
    })) {
      invoke.mockRejectedValue(
        new Error(`Tauri IPC channel has not been migrated: ephemeralVm:${method}`)
      )
    }
    vi.stubGlobal('window', {
      api: {
        ephemeralVm: {
          resumeWorkspace: mocks.resumeWorkspace,
          suspendWorkspace: mocks.suspendWorkspace,
          listRuntimes: mocks.listRuntimes,
          cleanup: mocks.cleanup
        }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('switches local worktrees immediately without waking a VM', async () => {
    const activation = activateWorktreeFromSidebar('wt-second')

    expect(mocks.state.activeWorktreeId).toBe('wt-second')
    await activation
    await activateWorktreeFromSidebar('wt-first')

    expect(mocks.state.activeWorktreeId).toBe('wt-first')
    expect(mocks.resumeWorkspace).not.toHaveBeenCalled()
    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-second', {
      revealInSidebar: false
    })
    expect(mocks.state.shutdownWorktreeTerminals).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('preserves the execution host when activating a worktree', async () => {
    await activateWorktreeFromSidebar('wt-second', 'local')

    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-second', {
      revealInSidebar: false,
      executionHostId: 'local'
    })
    expect(mocks.resumeWorkspace).not.toHaveBeenCalled()
  })

  it('activates folder workspaces through their existing path guard', async () => {
    await activateWorktreeFromSidebar('folder:folder-first', 'local')

    expect(mocks.activateAndRevealFolderWorkspace).toHaveBeenCalledWith('folder-first', {
      executionHostId: 'local'
    })
    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
    expect(mocks.resumeWorkspace).not.toHaveBeenCalled()
  })

  it('sleeps local terminals and allows reactivation without a VM interface', async () => {
    await runSleepWorktrees(['wt-first', 'wt-second'])

    expect(mocks.state.activeWorktreeId).toBeNull()
    for (const id of ['wt-first', 'wt-second']) {
      expect(mocks.state.shutdownWorktreeBrowsers).toHaveBeenCalledWith(id)
      expect(mocks.state.shutdownWorktreeTerminals).toHaveBeenCalledWith(id, {
        keepIdentifiers: true
      })
    }
    await activateWorktreeFromSidebar('wt-first')

    expect(mocks.state.activeWorktreeId).toBe('wt-first')
    expect(mocks.suspendWorkspace).not.toHaveBeenCalled()
    expect(mocks.resumeWorkspace).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('skips VM cleanup when deleting local workspaces', async () => {
    await expect(
      cleanupEphemeralVmRuntimesForDeleted({ workspaceIds: ['wt-first'] })
    ).resolves.toEqual([])

    expect(mocks.listRuntimes).not.toHaveBeenCalled()
    expect(mocks.cleanup).not.toHaveBeenCalled()
  })
})
