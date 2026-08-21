import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readCustomizationCommits,
  validateCustomizationCoverage
} from './fork-customization-commit-coverage.mjs'

const scriptPath = resolve(import.meta.dirname, 'fork-customization-commit-coverage.mjs')
const tempDirs = []
const entries = [
  { id: 'ORCAW-001', status: 'active' },
  { id: 'ORCAW-002', status: 'upstream-candidate' },
  { id: 'ORCAW-003', status: 'retired' }
]

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function makeRepository() {
  const cwd = mkdtempSync(join(tmpdir(), 'orcaw-customization-coverage-'))
  tempDirs.push(cwd)
  git(cwd, ['init', '--quiet'])
  git(cwd, ['config', 'user.email', 'fork-coverage-test@example.com'])
  git(cwd, ['config', 'user.name', 'Fork Coverage Test'])
  writeFileSync(join(cwd, 'fixture.txt'), 'base\n')
  git(cwd, ['add', 'fixture.txt'])
  git(cwd, ['commit', '--quiet', '-m', 'base'])
  return { cwd, baseRef: git(cwd, ['rev-parse', 'HEAD']) }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

describe('fork customization commit coverage', () => {
  it('requires active and candidate IDs exactly once and retired IDs zero times', () => {
    const commits = [
      { sha: 'a', subject: 'identity', customizationIds: ['ORCAW-001'], backports: [] },
      { sha: 'b', subject: 'candidate', customizationIds: ['ORCAW-002'], backports: [] }
    ]

    expect(validateCustomizationCoverage(entries, commits)).toEqual([])
  })

  it('reports missing, duplicate, retired, and unregistered IDs', () => {
    const commits = [
      { sha: 'a', subject: 'first', customizationIds: ['ORCAW-001'], backports: [] },
      { sha: 'b', subject: 'duplicate', customizationIds: ['ORCAW-001'], backports: [] },
      { sha: 'c', subject: 'retired', customizationIds: ['ORCAW-003'], backports: [] },
      { sha: 'd', subject: 'unknown', customizationIds: ['ORCAW-999'], backports: [] }
    ]

    expect(validateCustomizationCoverage(entries, commits)).toEqual(
      expect.arrayContaining([
        'ORCAW-001 appears in 2 commits; expected exactly 1',
        'ORCAW-002 appears in 0 commits; expected exactly 1',
        'Retired customization ORCAW-003 still appears in 1 commit',
        'Unregistered customization trailer: ORCAW-999'
      ])
    )
  })

  it('reports more than one customization trailer on one commit', () => {
    const commits = [
      {
        sha: 'a',
        subject: 'mixed customization',
        customizationIds: ['ORCAW-001', 'ORCAW-002'],
        backports: []
      }
    ]

    expect(validateCustomizationCoverage(entries, commits)).toContain(
      'Commit a has 2 Fork-Customization trailers; expected at most 1'
    )
  })

  it('reads customization and backport trailers from a Git commit body', () => {
    const fixture = makeRepository()
    writeFileSync(join(fixture.cwd, 'fixture.txt'), 'customized\n')
    git(fixture.cwd, ['add', 'fixture.txt'])
    git(fixture.cwd, [
      'commit',
      '--quiet',
      '-m',
      'feat: preserve identity',
      '-m',
      'Fork-Customization: ORCAW-001\nUpstream-Backport: stablyai/orca#12050'
    ])

    expect(
      readCustomizationCommits({ ...fixture, headRef: 'HEAD' }).map((commit) => ({
        subject: commit.subject,
        customizationIds: commit.customizationIds,
        backports: commit.backports
      }))
    ).toEqual([
      {
        subject: 'feat: preserve identity',
        customizationIds: ['ORCAW-001'],
        backports: ['stablyai/orca#12050']
      }
    ])
  })

  it('validates a replay range through the CLI', () => {
    const fixture = makeRepository()
    const registryPath = join(fixture.cwd, 'FORK_NOTES.md')
    writeFileSync(
      registryPath,
      `# Fork Notes\n\n## Customization Registry\n\n| ID | Title | Status | Introduced | Contract | Scope | Verification | Upstream |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| ORCAW-001 | Identity | active | unreleased | Contract | scope | test | none |\n`
    )
    writeFileSync(join(fixture.cwd, 'fixture.txt'), 'customized\n')
    git(fixture.cwd, ['add', 'fixture.txt', 'FORK_NOTES.md'])
    git(fixture.cwd, [
      'commit',
      '--quiet',
      '-m',
      'feat: preserve identity',
      '-m',
      'Fork-Customization: ORCAW-001'
    ])

    const result = spawnSync(
      process.execPath,
      [scriptPath, registryPath, fixture.baseRef, 'HEAD'],
      { cwd: fixture.cwd, encoding: 'utf8' }
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Validated 1 replayed fork customization')
  })
})
