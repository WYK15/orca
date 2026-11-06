import type { AppState } from '@/store/types'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { findFolderWorkspaceOwner } from '@/lib/folder-workspace-runtime-owner'
import { getFolderWorkspaceConnectionId } from '@/lib/folder-workspace-connection'

export type FolderExternalWatchState = Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo'> &
  Partial<
    Pick<
      AppState,
      | 'folderWorkspaces'
      | 'projectGroups'
      | 'activeWorktreeId'
      | 'activeWorkspaceExecutionHostId'
      | 'restoredRuntimeHostIdByWorkspaceSessionKey'
    >
  >

export function getFolderExternalWatchRoot(
  state: FolderExternalWatchState,
  worktreeId: string
): { path: string; connectionId: string | undefined } | null {
  const scope = parseWorkspaceKey(worktreeId)
  if (scope?.type !== 'folder') {
    return null
  }
  const owner = findFolderWorkspaceOwner(state, scope.folderWorkspaceId)
  const folder = state.folderWorkspaces?.find((entry) => entry === owner)
  if (!folder) {
    return null
  }
  const connectionId = getFolderWorkspaceConnectionId(
    {
      folderWorkspaces: [folder],
      projectGroups: state.projectGroups ?? [],
      repos: state.repos
    },
    folder.id
  )
  return connectionId === undefined
    ? null
    : {
        path: folder.folderPath,
        connectionId: connectionId ?? undefined
      }
}
