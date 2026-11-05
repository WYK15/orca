import { useContext } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { ContextMenuItem, ContextMenuShortcut } from '@/components/ui/context-menu'
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { FileExplorerOperationOwner } from './file-explorer-types'
import { FileExplorerPasteContext } from './FileExplorerPasteProvider'

export function FileExplorerPasteMenuItem({
  directory,
  operationOwner,
  variant = 'context'
}: {
  directory: string
  operationOwner?: FileExplorerOperationOwner
  variant?: 'context' | 'dropdown'
}): React.JSX.Element | null {
  const context = useContext(FileExplorerPasteContext)
  if (!context?.available) {
    return null
  }
  const Item = variant === 'context' ? ContextMenuItem : DropdownMenuItem
  const Shortcut = variant === 'context' ? ContextMenuShortcut : DropdownMenuShortcut
  return (
    <Item
      disabled={context.busy || operationOwner?.kind === 'unresolved'}
      onSelect={() => {
        void context.paste(directory, operationOwner)
      }}
    >
      <ClipboardPaste />
      {translate('menu.paste', 'Paste')}
      <Shortcut>{navigator.userAgent.includes('Mac') ? '⌘V' : 'Ctrl+V'}</Shortcut>
    </Item>
  )
}
