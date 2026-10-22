import { describe, expect, it } from 'vitest'
import {
  buildSidebarProjectCatalog,
  getArchivedSidebarRepoIds,
  normalizeSidebarProjectArchive,
  updateSidebarProjectArchive
} from './sidebar-project-archive'
import type { Project, Repo } from './types'

const repo = (id: string, extra: Partial<Repo> = {}): Repo => ({
  id,
  path: `/work/${id}`,
  displayName: id,
  badgeColor: '',
  addedAt: 1,
  ...extra
})
const project = (id: string, repoIds: string[]): Project => ({
  id,
  displayName: id,
  badgeColor: '',
  sourceRepoIds: repoIds,
  createdAt: 1,
  updatedAt: 1
})

describe('project sidebar archive', () => {
  it('archives a logical project across its local and SSH setups while keeping unrelated folders visible', () => {
    const repos = [
      repo('local'),
      repo('remote', { connectionId: 'server' }),
      repo('folder', { kind: 'folder' })
    ]
    const settings = { sidebarProjectArchive: { local: 100 }, sidebarPinnedRepoIds: ['remote'] }
    const projects = [project('app', ['local', 'remote'])]
    const catalog = buildSidebarProjectCatalog(repos, projects, settings)
    expect(catalog.map((entry) => [entry.id, entry.archivedAt, entry.pinned])).toEqual([
      ['app', 100, true],
      ['repo:folder', null, false]
    ])
    expect([...getArchivedSidebarRepoIds(repos, projects, settings)]).toEqual(['local', 'remote'])
    expect(repos).toHaveLength(3)
  })
  it('keeps hosts isolated when their folders have the same path but different repo identities', () => {
    const repos = [
      repo('local', { path: '/same' }),
      repo('ssh:one:repo', { path: '/same', connectionId: 'one' })
    ]
    expect([
      ...getArchivedSidebarRepoIds(repos, [], { sidebarProjectArchive: { local: 100 } })
    ]).toEqual(['local'])
  })
  it('restores only selected projects without changing unrelated archive state', () => {
    const archive = { a: 100, b: 200 }
    expect(updateSidebarProjectArchive(archive, ['a'], null)).toEqual({ b: 200 })
    expect(archive).toEqual({ a: 100, b: 200 })
    expect(updateSidebarProjectArchive(archive, ['c'], 300)).toEqual({ a: 100, b: 200, c: 300 })
  })
  it('ignores malformed timestamps and retains temporarily unavailable host records', () => {
    expect(normalizeSidebarProjectArchive({ a: 0, b: Infinity, c: '4', offline: 200 })).toEqual({
      offline: 200
    })
    expect(updateSidebarProjectArchive({ offline: 200 }, ['local'], 100)).toEqual({
      offline: 200,
      local: 100
    })
  })
})
