import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useProjectHostSetupProjection } from '@/store/selectors'
import { buildSidebarProjectCatalog } from '../../../../shared/sidebar-project-archive'

export function useSidebarProjectCatalog() {
  const repos = useAppStore((state) => state.repos)
  const projection = useProjectHostSetupProjection()
  const archive = useAppStore((state) => state.settings?.sidebarProjectArchive)
  const pins = useAppStore((state) => state.settings?.sidebarPinnedRepoIds)
  return useMemo(
    () =>
      buildSidebarProjectCatalog(repos, projection.projects, {
        sidebarProjectArchive: archive,
        sidebarPinnedRepoIds: pins
      }),
    [repos, projection, archive, pins]
  )
}
