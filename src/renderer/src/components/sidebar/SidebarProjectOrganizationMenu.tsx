import type { ReactElement } from 'react'
import { Archive, Pin, PinOff } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { Repo } from '../../../../shared/types'
import { useSidebarProjectCatalog } from './use-sidebar-project-catalog'
import {
  setSidebarProjectsArchived,
  toggleSidebarProjectPin
} from './sidebar-project-archive-actions'
import { translate } from '@/i18n/i18n'
import { PERSONAL_DESKTOP_ENABLED } from '../../../../shared/fork-feature-policy'

function useProjectForRepo(repo: Repo | null | undefined) {
  const entries = useSidebarProjectCatalog()
  return entries.find((entry) => repo && entry.repoIds.includes(repo.id))
}

export function SidebarProjectOrganizationMenu({ repo }: { repo: Repo }) {
  const entry = useProjectForRepo(repo)
  if (!PERSONAL_DESKTOP_ENABLED || !entry) {
    return null
  }
  const PinIcon = entry.pinned ? PinOff : Pin
  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          void toggleSidebarProjectPin(entry)
        }}
      >
        <PinIcon />
        {entry.pinned
          ? translate('fork.archive.unpin', 'Unpin project')
          : translate('fork.archive.pin', 'Pin project')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          void setSidebarProjectsArchived([entry], true)
        }}
      >
        <Archive />
        {translate('fork.archive.archiveProject', 'Archive project')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}

export function SidebarProjectPinnedIndicator({ repo }: { repo: Repo | null | undefined }) {
  const entry = useProjectForRepo(repo)
  return PERSONAL_DESKTOP_ENABLED && entry?.pinned ? (
    <Pin
      className="size-3 shrink-0 text-muted-foreground"
      aria-label={translate('fork.archive.pinned', 'Pinned project')}
    />
  ) : null
}

export function SidebarProjectContextMenu({
  repo,
  children
}: {
  repo: Repo | null | undefined
  children: ReactElement
}) {
  const entry = useProjectForRepo(repo)
  if (!PERSONAL_DESKTOP_ENABLED || !entry) {
    return children
  }
  const PinIcon = entry.pinned ? PinOff : Pin
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            void toggleSidebarProjectPin(entry)
          }}
        >
          <PinIcon />
          {entry.pinned
            ? translate('fork.archive.unpin', 'Unpin project')
            : translate('fork.archive.pin', 'Pin project')}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void setSidebarProjectsArchived([entry], true)
          }}
        >
          <Archive />
          {translate('fork.archive.archiveProject', 'Archive project')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
