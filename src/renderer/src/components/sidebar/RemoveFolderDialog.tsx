import React, { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  getRepoExecutionHostId,
  isRuntimeOwnedSshTargetId,
  type ExecutionHostId
} from '../../../../shared/execution-host'

// Why: interpolated into the sentence so locales control where the name sits;
// U+0000 cannot appear in a real project name, so the split is unambiguous.
const NAME_TOKEN = '\u0000'

const RemoveFolderDialog = React.memo(function RemoveFolderDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const removeProject = useAppStore((s) => s.removeProject)

  const isOpen = activeModal === 'confirm-remove-folder'
  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const displayName = typeof modalData.displayName === 'string' ? modalData.displayName : ''
  const hostId = typeof modalData.hostId === 'string' ? (modalData.hostId as ExecutionHostId) : null

  // Why: for an SSH project the files live on the remote host's disk, not the
  // user's — "still on your disk" would be misleading. Name the host (using the
  // removed-target label when it's a ghost) so the user knows where it remains
  // and that re-adding that host recovers it.
  const sshConnectionId = useAppStore(
    (s) =>
      s.repos
        .find((repo) => repo.id === repoId && (!hostId || getRepoExecutionHostId(repo) === hostId))
        ?.connectionId?.trim() ?? null
  )
  const sshHostLabel = useAppStore((s) => {
    if (!sshConnectionId) {
      return null
    }
    return (
      s.sshTargetLabels.get(sshConnectionId) ??
      s.removedSshTargetLabels.get(sshConnectionId) ??
      sshConnectionId
    )
  })

  // Why: fragment concatenation around the styled name cannot be reordered by
  // SOV locales (#9294). Translate one full sentence with the name as a
  // sentinel token, then split on it to re-apply the inline emphasis.
  const description = isRuntimeOwnedSshTargetId(sshConnectionId)
    ? translate(
        'auto.components.sidebar.RemoveFolderDialog.removeDescriptionVmRecipe',
        'This removes {{name}} from Orca. Its VM recipe determines whether the environment and its files are permanently deleted.',
        { name: NAME_TOKEN }
      )
    : sshHostLabel
      ? translate(
          'auto.components.sidebar.RemoveFolderDialog.removeDescriptionSsh',
          'This removes {{name}} and all of its worktrees from Orca on {{host}}. Open panels and terminals will close. No folders, files, Git worktrees, or branches will be deleted. To restore the project, use Add Project, choose the same host, and enter its original path.',
          { name: NAME_TOKEN, host: sshHostLabel }
        )
      : translate(
          'auto.components.sidebar.RemoveFolderDialog.removeDescriptionLocal',
          'This removes {{name}} and all of its worktrees from Orca. Open panels and terminals will close. No folders, files, Git worktrees, or branches will be deleted. To restore the project, use Add Project and select its original folder.',
          { name: NAME_TOKEN }
        )
  const [descriptionBeforeName, descriptionAfterName] = description.split(NAME_TOKEN)

  const handleConfirm = useCallback(() => {
    if (repoId) {
      void removeProject(repoId, {
        ...(hostId ? { hostId } : {}),
        errorFeedback: 'toast'
      })
    }
    closeModal()
  }, [closeModal, hostId, removeProject, repoId])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate(
              'auto.components.sidebar.RemoveFolderDialog.title',
              'Remove Project from Orca?'
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {descriptionBeforeName}
            <span className="break-all font-medium text-foreground">{displayName}</span>
            {descriptionAfterName}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {translate('auto.components.sidebar.RemoveFolderDialog.d36883e046', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {translate('auto.components.sidebar.RemoveFolderDialog.confirm', 'Remove from Orca')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default RemoveFolderDialog
