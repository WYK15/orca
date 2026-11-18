import type { ReactElement } from 'react'
import { FolderInput, FolderOutput, Pin, PinOff } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { Repo } from '../../../../shared/types'
import { useSidebarProjectCatalog } from './use-sidebar-project-catalog'
import { toggleSidebarProjectPin } from './sidebar-project-archive-actions'
import { translate } from '@/i18n/i18n'
import { PERSONAL_DESKTOP_ENABLED } from '../../../../shared/fork-feature-policy'
import { useAppStore } from '@/store'
import {
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../../shared/execution-host'
import { getProjectGroupExecutionHostIdForRows } from './worktree-list-host-filtering'
import { toast } from 'sonner'

function useProjectForRepo(repo: Repo | null | undefined) {
  const entries = useSidebarProjectCatalog()
  return entries.find((entry) => repo && entry.repoIds.includes(repo.id))
}

export function SidebarProjectOrganizationMenu({ repo }: { repo: Repo }) {
  const entry = useProjectForRepo(repo)
  if (!PERSONAL_DESKTOP_ENABLED || !entry || !repo) {
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
  const groups = useAppStore((state) => state.projectGroups)
  const settings = useAppStore((state) => state.settings)
  if (!PERSONAL_DESKTOP_ENABLED || !entry || !repo) {
    return children
  }
  const PinIcon = entry.pinned ? PinOff : Pin
  const host = getRepoExecutionHostId(repo)
  const eligibleGroups = (groups ?? []).filter(
    (group) =>
      !group.parentGroupId &&
      getProjectGroupExecutionHostIdForRows(group, getSettingsFocusedExecutionHostId(settings)) ===
        host
  )
  const move = async (groupId: string | null) => {
    if (!(await useAppStore.getState().moveProjectToGroup(repo.id, groupId))) {
      toast.error(translate('fork.groups.moveFailed', 'Could not move the project.'))
    }
  }
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
        {eligibleGroups.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderInput />
              {translate('fork.groups.moveTo', 'Move to group')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {eligibleGroups.map((group) => (
                <ContextMenuItem
                  key={group.id}
                  disabled={repo?.projectGroupId === group.id}
                  onSelect={() => {
                    void move(group.id)
                  }}
                >
                  <span className="max-w-48 truncate">{group.name}</span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {repo?.projectGroupId && (
          <ContextMenuItem
            onSelect={() => {
              void move(null)
            }}
          >
            <FolderOutput />
            {translate('fork.groups.remove', 'Remove from group')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
