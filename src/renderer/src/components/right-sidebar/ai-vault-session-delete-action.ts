import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { translate } from '@/i18n/i18n'

/**
 * Owns the AI Vault delete-confirmation flow: which session is pending
 * deletion, the in-flight state, and the IPC call + toast + force-refresh on
 * settle. Extracted from AiVaultPanel to keep it under the file's line budget.
 */
export function useAiVaultSessionDeleteAction({
  refresh
}: {
  refresh: (options: { force: boolean }) => Promise<void>
}): {
  sessionPendingDelete: AiVaultSession | null
  deletingSession: boolean
  requestDelete: (session: AiVaultSession) => void
  handleDialogOpenChange: (open: boolean) => void
  handleConfirmDelete: () => Promise<void>
} {
  const [sessionPendingDelete, setSessionPendingDelete] = useState<AiVaultSession | null>(null)
  const [deletingSession, setDeletingSession] = useState(false)

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      // Radix still fires its Escape / outside-click / X close while the Cancel
      // button is disabled mid-delete; ignore those so an in-flight delete can't
      // be dismissed out from under itself.
      if (deletingSession) {
        return
      }
      if (!open) {
        setSessionPendingDelete(null)
      }
    },
    [deletingSession]
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!sessionPendingDelete) {
      return
    }
    setDeletingSession(true)
    try {
      const result = await window.api.aiVault.deleteSession({
        agent: sessionPendingDelete.agent,
        filePath: sessionPendingDelete.filePath,
        executionHostId: sessionPendingDelete.executionHostId
      })
      if (result.outcome === 'deleted') {
        toast.success(
          translate('auto.components.right.sidebar.AiVaultPanel.sessionDeleted', 'Session deleted')
        )
        // Belt to the main side's braces: caches are already invalidated there,
        // this force refresh is only for immediate UX.
        void refresh({ force: true })
      } else {
        // 'rejected' and 'failed' share one generic, translated message — the
        // specific reason is a main-side detail, not something to surface raw.
        toast.error(
          translate(
            'auto.components.right.sidebar.AiVaultPanel.sessionDeleteFailed',
            "Couldn't delete the session"
          )
        )
      }
    } catch {
      // The main handler resolves with a 'failed'/'rejected' outcome rather
      // than throwing, but the IPC invoke itself can still reject on a
      // transport or serialization error. Surface the same generic failure
      // toast instead of leaking an unhandled rejection (the caller fires this
      // with `void handleConfirmDelete()`).
      toast.error(
        translate(
          'auto.components.right.sidebar.AiVaultPanel.sessionDeleteFailed',
          "Couldn't delete the session"
        )
      )
    } finally {
      setDeletingSession(false)
      setSessionPendingDelete(null)
    }
  }, [refresh, sessionPendingDelete])

  return {
    sessionPendingDelete,
    deletingSession,
    requestDelete: setSessionPendingDelete,
    handleDialogOpenChange,
    handleConfirmDelete
  }
}
