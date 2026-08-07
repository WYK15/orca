import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { agentLabel } from './ai-vault-session-filters'

export function AiVaultSessionDeleteDialog({
  open,
  sessions,
  deleting,
  onOpenChange,
  onConfirm
}: {
  open: boolean
  sessions: readonly AiVaultSession[]
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}): React.JSX.Element {
  // Why: Radix keeps DialogContent mounted during the close animation; once
  // the caller nulls `session` the copy would flash blank mid-fade-out.
  const lastSessionsRef = useRef<readonly AiVaultSession[]>(sessions)
  if (sessions.length > 0) {
    lastSessionsRef.current = sessions
  }
  const displayedSessions = sessions.length > 0 ? sessions : lastSessionsRef.current
  const displayedSession = displayedSessions[0] ?? null
  const multipleSessions = displayedSessions.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {multipleSessions
              ? translate(
                  'auto.components.right.sidebar.AiVaultSessionDeleteDialog.bulkTitle',
                  'Delete selected sessions?'
                )
              : translate(
                  'auto.components.right.sidebar.AiVaultSessionDeleteDialog.title',
                  'Delete this session?'
                )}
          </DialogTitle>
          <DialogDescription>
            {multipleSessions
              ? translate(
                  'auto.components.right.sidebar.AiVaultSessionDeleteDialog.bulkDescription',
                  "{{count}} sessions will be deleted. They will no longer be resumable from their agents' own command lines either.",
                  { count: displayedSessions.length }
                )
              : displayedSession
                ? translate(
                    'auto.components.right.sidebar.AiVaultSessionDeleteDialog.description',
                    '"{{value0}}" will be deleted. Once deleted, it will no longer be resumable from {{value1}}\'s own command line either.',
                    { value0: displayedSession.title, value1: agentLabel(displayedSession.agent) }
                  )
                : null}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={deleting}>
            {translate('auto.components.right.sidebar.AiVaultSessionDeleteDialog.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
            {translate(
              'auto.components.right.sidebar.AiVaultSessionDeleteDialog.confirm',
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
