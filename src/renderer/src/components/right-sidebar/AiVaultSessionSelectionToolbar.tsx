import { CheckSquare, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'

export function AiVaultSessionSelectionToolbar({
  selectedCount,
  deletableCount,
  allSelected,
  deleting,
  onToggleAll,
  onDelete,
  onCancel
}: {
  selectedCount: number
  deletableCount: number
  allSelected: boolean
  deleting: boolean
  onToggleAll: () => void
  onDelete: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 border-b border-sidebar-border bg-sidebar px-2.5 py-1.5">
      <Checkbox
        checked={allSelected}
        onCheckedChange={onToggleAll}
        disabled={deletableCount === 0 || deleting}
        aria-label={translate(
          'auto.components.right.sidebar.AiVaultPanel.selectAllSessions',
          'Select all sessions'
        )}
      />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.AiVaultPanel.sessionsSelected',
          '{{count}} selected',
          {
            count: selectedCount
          }
        )}
      </span>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel} disabled={deleting}>
        <X className="size-3.5" />
        {translate('auto.components.right.sidebar.AiVaultPanel.cancelSelection', 'Cancel')}
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="xs"
        onClick={onDelete}
        disabled={selectedCount === 0 || deleting}
      >
        <Trash2 className="size-3.5" />
        {translate('auto.components.right.sidebar.AiVaultPanel.deleteSelected', 'Delete')}
      </Button>
    </div>
  )
}

export function AiVaultSessionSelectionButton({
  onClick
}: {
  onClick: () => void
}): React.JSX.Element {
  return (
    <Button type="button" variant="ghost" size="xs" onClick={onClick}>
      <CheckSquare className="size-3.5" />
      {translate('auto.components.right.sidebar.AiVaultPanel.selectSessions', 'Select')}
    </Button>
  )
}
