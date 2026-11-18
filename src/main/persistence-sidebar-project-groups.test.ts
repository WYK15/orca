import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => fixture.directory },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('../shared/fork-feature-policy', async (importOriginal) => ({
  ...(await importOriginal<Record<string, boolean>>()),
  PERSONAL_DESKTOP_ENABLED: true,
  REMOTE_HOSTS_ENABLED: false
}))

import { Store } from './persistence'

afterEach(() => {
  if (fixture.directory) {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

it('persists migrated archive membership and collapsed state exactly once across restarts', () => {
  fixture.directory = mkdtempSync(join(tmpdir(), 'orcaw-project-group-migration-'))
  const dataFile = join(fixture.directory, 'orca-data.json')
  const folder = join(fixture.directory, 'folder')
  mkdirSync(folder)
  writeFileSync(
    dataFile,
    JSON.stringify({
      repos: [
        {
          id: 'folder',
          path: folder,
          displayName: 'Folder',
          kind: 'folder',
          badgeColor: '',
          addedAt: 1
        }
      ],
      projectGroups: [],
      settings: { uiLanguage: 'zh', sidebarProjectArchive: { folder: 100 } },
      ui: { collapsedGroups: ['repo:existing'] }
    })
  )
  const first = new Store({ dataFile })
  expect(first.getProjectGroups()).toEqual([
    expect.objectContaining({ id: 'sidebar-archive:local', name: '归档' })
  ])
  expect(first.getUI().collapsedGroups).toContain('project-group:sidebar-archive:local')
  expect(first.getSettings().sidebarProjectArchive).toEqual({})
  first.flushOrThrow()
  const saved = JSON.parse(readFileSync(dataFile, 'utf8'))
  expect(saved.repos[0]).toMatchObject({ path: folder, projectGroupId: 'sidebar-archive:local' })
  const second = new Store({ dataFile })
  expect(second.getProjectGroups()).toHaveLength(1)
  expect(second.getUI().collapsedGroups).toContain('project-group:sidebar-archive:local')
  second.flushOrThrow()
})
