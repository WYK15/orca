// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ProjectGroup, Repo } from '../../../../shared/types'

const mocks = vi.hoisted(() => ({
  state: { projectGroups: [] as ProjectGroup[], settings: {}, moveProjectToGroup: vi.fn() },
  error: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (select: (state: typeof mocks.state) => unknown) => select(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('../../../../shared/fork-feature-policy', () => ({
  PERSONAL_DESKTOP_ENABLED: true,
  REMOTE_HOSTS_ENABLED: true
}))
vi.mock('./use-sidebar-project-catalog', () => ({
  useSidebarProjectCatalog: () => [{ repoIds: ['project'], pinned: false }]
}))
vi.mock('@/components/ui/context-menu', () => {
  const container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    ContextMenu: container,
    ContextMenuTrigger: container,
    ContextMenuContent: container,
    ContextMenuSub: container,
    ContextMenuSubContent: container,
    ContextMenuSubTrigger: container,
    ContextMenuItem: ({
      children,
      onSelect,
      disabled
    }: {
      children: ReactNode
      onSelect: () => void
      disabled?: boolean
    }) => (
      <button disabled={disabled} onClick={onSelect}>
        {children}
      </button>
    )
  }
})
import { SidebarProjectContextMenu } from './SidebarProjectOrganizationMenu'

const repo: Repo = {
  id: 'project',
  path: '/work/project',
  displayName: 'Project',
  badgeColor: '',
  addedAt: 1,
  kind: 'folder'
}
const group = (id: string, extra: Partial<ProjectGroup> = {}): ProjectGroup => ({
  id,
  name: id,
  parentPath: null,
  parentGroupId: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1,
  executionHostId: 'local',
  ...extra
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.projectGroups = []
  mocks.state.moveProjectToGroup.mockResolvedValue(true)
})
afterEach(cleanup)

it('offers root groups on the project owner host and omits the archive action', () => {
  mocks.state.projectGroups = [
    group('Local'),
    group('SSH', { connectionId: 'server', executionHostId: 'ssh:server' }),
    group('Nested', { parentGroupId: 'Local' })
  ]
  render(
    <SidebarProjectContextMenu repo={repo}>
      <span>Project title</span>
    </SidebarProjectContextMenu>
  )
  expect(screen.getByRole('button', { name: 'Local' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'SSH' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Nested' })).toBeNull()
  expect(screen.queryByText('Archive project')).toBeNull()
})

it('moves a folder project through the existing metadata action and can remove its grouping', async () => {
  mocks.state.projectGroups = [group('Work')]
  render(
    <SidebarProjectContextMenu repo={{ ...repo, projectGroupId: 'Work' }}>
      <span>Project title</span>
    </SidebarProjectContextMenu>
  )
  expect(screen.getByRole('button', { name: 'Work' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove from group' }))
  await waitFor(() => expect(mocks.state.moveProjectToGroup).toHaveBeenCalledWith('project', null))
})

it('keeps SSH group selection on its owner and reports a failed move', async () => {
  mocks.state.projectGroups = [
    group('Local'),
    group('Server work', { connectionId: 'server', executionHostId: 'ssh:server' })
  ]
  mocks.state.moveProjectToGroup.mockResolvedValue(false)
  render(
    <SidebarProjectContextMenu repo={{ ...repo, connectionId: 'server' }}>
      <span>Project title</span>
    </SidebarProjectContextMenu>
  )
  expect(screen.queryByRole('button', { name: 'Local' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Server work' }))
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not move the project.'))
  expect(mocks.state.moveProjectToGroup).toHaveBeenCalledWith('project', 'Server work')
})
