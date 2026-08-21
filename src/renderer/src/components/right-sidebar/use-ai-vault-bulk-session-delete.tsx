import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { AiVaultSessionSelectionToolbar } from './AiVaultSessionSelectionToolbar'
import { aiVaultSessionDeleteBlockedReason } from './ai-vault-session-deletability'
import { useAiVaultSessionSelection } from './ai-vault-session-selection'

export function useAiVaultBulkSessionDelete({
  filteredSessions,
  refresh
}: {
  filteredSessions: readonly AiVaultSession[]
  refresh: (options: { force: boolean }) => Promise<void>
}): {
  selectionMode: boolean
  selectedSessionIds: ReadonlySet<string>
  enterSelectionMode: () => void
  toggleSession: (session: AiVaultSession) => void
  deleteSelected: () => Promise<void>
  controls: React.JSX.Element | null
} {
  const confirm = useConfirmationDialog()
  const selection = useAiVaultSessionSelection()
  const [deleting, setDeleting] = useState(false)
  const deletableSessions = useMemo(
    () => filteredSessions.filter((session) => aiVaultSessionDeleteBlockedReason(session) === null),
    [filteredSessions]
  )
  const selectedSessions = useMemo(
    () => deletableSessions.filter((session) => selection.selectedSessionIds.has(session.id)),
    [deletableSessions, selection.selectedSessionIds]
  )
  const allSelected =
    deletableSessions.length > 0 &&
    deletableSessions.every((session) => selection.selectedSessionIds.has(session.id))

  const toggleSession = useCallback(
    (session: AiVaultSession) => {
      if (aiVaultSessionDeleteBlockedReason(session) === null) {
        selection.toggleSession(session.id)
      }
    },
    [selection]
  )

  const deleteSelected = useCallback(async () => {
    if (selectedSessions.length === 0 || deleting) {
      return
    }
    const confirmed = await confirm({
      title: translate(
        'auto.components.right.sidebar.AiVaultSessionDeleteDialog.bulkTitle',
        'Delete selected sessions?'
      ),
      description: translate(
        'auto.components.right.sidebar.AiVaultSessionDeleteDialog.bulkDescription',
        '{{count}} sessions will be deleted. They will no longer be resumable from their agents’ own command lines either.',
        { count: selectedSessions.length }
      ),
      confirmLabel: translate(
        'auto.components.right.sidebar.AiVaultSessionDeleteDialog.confirm',
        'Delete'
      ),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }

    setDeleting(true)
    const deletedIds: string[] = []
    let failed = false
    try {
      for (const session of selectedSessions) {
        try {
          const result = await window.api.aiVault.deleteSession({
            agent: session.agent,
            sessionId: session.sessionId,
            codexHome: session.codexHome,
            filePath: session.filePath,
            executionHostId: session.executionHostId
          })
          if (result.outcome === 'deleted') {
            deletedIds.push(session.id)
          } else {
            failed = true
          }
        } catch {
          failed = true
        }
      }
      if (deletedIds.length > 0) {
        selection.removeSessions(deletedIds)
        await refresh({ force: true })
        toast.success(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.sessionsDeleted',
            '{{count}} sessions deleted',
            { count: deletedIds.length }
          )
        )
      }
      if (failed) {
        toast.error(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.sessionDeleteFailed',
            "Couldn't delete the session"
          )
        )
      }
    } finally {
      setDeleting(false)
    }
  }, [confirm, deleting, refresh, selectedSessions, selection])

  return {
    selectionMode: selection.selectionMode,
    selectedSessionIds: selection.selectedSessionIds,
    enterSelectionMode: selection.enterSelectionMode,
    toggleSession,
    deleteSelected,
    controls: selection.selectionMode ? (
      <AiVaultSessionSelectionToolbar
        selectedCount={selectedSessions.length}
        deletableCount={deletableSessions.length}
        allSelected={allSelected}
        deleting={deleting}
        onToggleAll={() => selection.toggleAll(deletableSessions.map((session) => session.id))}
        onDelete={() => void deleteSelected()}
        onCancel={selection.exitSelectionMode}
      />
    ) : null
  }
}
