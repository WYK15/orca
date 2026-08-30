import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'

export default function ArchivedWorktreeRecoveryList({
  worktrees,
  busyWorktreeId,
  disabled,
  onShow
}: {
  worktrees: readonly Worktree[]
  busyWorktreeId: string | null
  disabled: boolean
  onShow: (worktree: Worktree) => void
}): React.JSX.Element | null {
  const hidden = worktrees.filter((worktree) => worktree.isArchived && !worktree.isMainWorktree)
  if (hidden.length === 0) {
    return null
  }

  return (
    <section className="grid min-w-0 gap-2">
      <div>
        <h3 className="text-sm font-medium">
          {translate(
            'auto.components.sidebar.ArchivedWorktreeRecoveryList.heading',
            'Worktrees hidden by you ({{count}})',
            { count: hidden.length }
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.sidebar.ArchivedWorktreeRecoveryList.description',
            'Showing a worktree restores it in Orca without changing its files or Git branch.'
          )}
        </p>
      </div>
      <ul className="grid min-w-0 gap-1">
        {hidden.map((worktree) => (
          <li
            key={`${worktree.hostId ?? 'local'}:${worktree.id}`}
            className="flex min-w-0 items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-accent/50"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
              <Eye className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{worktree.displayName}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {worktree.path}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busyWorktreeId !== null}
              onClick={() => onShow(worktree)}
            >
              {busyWorktreeId === worktree.id
                ? translate(
                    'auto.components.sidebar.ArchivedWorktreeRecoveryList.showing',
                    'Showing…'
                  )
                : translate('auto.components.sidebar.ArchivedWorktreeRecoveryList.show', 'Show')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
