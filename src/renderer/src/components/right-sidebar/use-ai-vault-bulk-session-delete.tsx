import { useMemo } from 'react'
import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { AiVaultSessionDeleteDialog } from './AiVaultSessionDeleteDialog'
import { AiVaultSessionSelectionToolbar } from './AiVaultSessionSelectionToolbar'
import { resolveAiVaultSessionDeletability } from './ai-vault-session-deletability'
import { useAiVaultSessionDeleteAction } from './ai-vault-session-delete-action'
import { useAiVaultSessionSelection } from './ai-vault-session-selection'

export function useAiVaultBulkSessionDelete({
  filteredSessions,
  getSessionLiveState,
  refresh
}: {
  filteredSessions: readonly AiVaultSession[]
  getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
  refresh: (options: { force: boolean }) => Promise<void>
}): {
  selectionMode: boolean
  selectedSessionIds: ReadonlySet<string>
  enterSelectionMode: () => void
  toggleSession: (session: AiVaultSession) => void
  requestDelete: (session: AiVaultSession) => void
  controls: React.JSX.Element
} {
  const selection = useAiVaultSessionSelection()
  const deletableSessions = useMemo(
    () =>
      filteredSessions.filter(
        (session) =>
          resolveAiVaultSessionDeletability(session, getSessionLiveState(session)).deletable
      ),
    [filteredSessions, getSessionLiveState]
  )
  const selectedSessions = useMemo(
    () => deletableSessions.filter((session) => selection.selectedSessionIds.has(session.id)),
    [deletableSessions, selection.selectedSessionIds]
  )
  const deletion = useAiVaultSessionDeleteAction({
    refresh,
    onDeleted: (sessions) => selection.removeSessions(sessions.map((session) => session.id))
  })
  const allSelected =
    deletableSessions.length > 0 &&
    deletableSessions.every((session) => selection.selectedSessionIds.has(session.id))

  return {
    selectionMode: selection.selectionMode,
    selectedSessionIds: selection.selectedSessionIds,
    enterSelectionMode: selection.enterSelectionMode,
    toggleSession: (session) => selection.toggleSession(session.id),
    requestDelete: deletion.requestDelete,
    controls: (
      <>
        {selection.selectionMode ? (
          <AiVaultSessionSelectionToolbar
            selectedCount={selectedSessions.length}
            deletableCount={deletableSessions.length}
            allSelected={allSelected}
            deleting={deletion.deletingSession}
            onToggleAll={() => selection.toggleAll(deletableSessions.map((session) => session.id))}
            onDelete={() => deletion.requestBulkDelete(selectedSessions)}
            onCancel={selection.exitSelectionMode}
          />
        ) : null}
        <AiVaultSessionDeleteDialog
          open={deletion.sessionsPendingDelete.length > 0}
          sessions={deletion.sessionsPendingDelete}
          deleting={deletion.deletingSession}
          onOpenChange={deletion.handleDialogOpenChange}
          onConfirm={() => void deletion.handleConfirmDelete()}
        />
      </>
    )
  }
}
