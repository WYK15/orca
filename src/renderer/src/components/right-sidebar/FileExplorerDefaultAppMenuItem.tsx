import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { requireMatchingFileExplorerOperationRoute } from './file-explorer-operation-owner'
import type { TreeNode } from './file-explorer-types'

export function FileExplorerDefaultAppMenuItem({
  node,
  worktreeId,
  selectionSize,
  remote
}: {
  node: TreeNode
  worktreeId: string | null
  selectionSize: number
  remote: boolean
}): React.JSX.Element | null {
  if (
    node.isDirectory ||
    node.operationOwner?.kind !== 'local' ||
    !worktreeId ||
    remote ||
    selectionSize !== 1 ||
    (globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__ === true
  ) {
    return null
  }

  const openFile = async (): Promise<void> => {
    const failureMessage = translate(
      'fileExplorer.defaultApp.openFailed',
      "Couldn't open the file with its default app."
    )
    try {
      requireMatchingFileExplorerOperationRoute(worktreeId, node.operationOwner)
      if (!(await window.api.shell.openFilePath(node.path))) {
        toast.error(failureMessage)
      }
    } catch (error) {
      toast.error(extractIpcErrorMessage(error, failureMessage))
    }
  }

  return (
    <ContextMenuItem onSelect={() => void openFile()}>
      <ExternalLink />
      {translate('fileExplorer.defaultApp.open', 'Open with Default App')}
    </ContextMenuItem>
  )
}
