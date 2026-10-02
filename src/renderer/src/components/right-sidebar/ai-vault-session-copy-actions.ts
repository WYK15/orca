import { useCallback } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

// Shared clipboard feedback, kept outside the panel's layout orchestration.
export function useAiVaultSessionCopyActions() {
  const copyText = useCallback(async (text: string, label: string): Promise<void> => {
    await window.api.ui.writeClipboardText(text)
    toast.success(
      translate('auto.components.right.sidebar.AiVaultPanel.valueCopied', '{{value0}} copied', {
        value0: label
      })
    )
  }, [])
  return {
    copyId: (session: AiVaultSession) =>
      void copyText(
        session.sessionId,
        translate('auto.components.right.sidebar.AiVaultPanel.sessionId', 'Session ID')
      ),
    copyPath: (session: AiVaultSession) =>
      void copyText(
        session.filePath,
        translate('auto.components.right.sidebar.AiVaultPanel.logPath', 'Log path')
      )
  }
}
