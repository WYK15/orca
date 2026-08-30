import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseForkUpstreamAdoptionArguments,
  runForkUpstreamAdoption,
  runVitest
} from './fork-upstream-adoption.mjs'

const tempDirs = []

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function registry({ verification = '`test/adoption.test.ts`, `test/adoption.test.ts`' } = {}) {
  return `# Fork Notes\n\n## Customization Registry\n\n| ID | Title | Status | Introduced | Contract | Scope | Verification | Upstream |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| ORCAW-001 | Test adoption | active | unreleased | Preserve behavior | test/adoption.ts | ${verification} | none |\n`
}

function makeCandidateRepository() {
  const cwd = mkdtempSync(join(tmpdir(), 'orcaw-upstream-adoption-'))
  tempDirs.push(cwd)
  git(cwd, ['init', '--quiet'])
  git(cwd, ['config', 'user.email', 'fork-adoption-test@example.com'])
  git(cwd, ['config', 'user.name', 'Fork Adoption Test'])
  writeFileSync(join(cwd, 'package.json'), '{"version":"1.2.3"}\n')
  git(cwd, ['add', 'package.json'])
  git(cwd, ['commit', '--quiet', '-m', 'upstream base'])
  git(cwd, ['tag', 'v1.2.3'])
  writeFileSync(join(cwd, 'FORK_NOTES.md'), registry())
  mkdirSync(join(cwd, 'test'))
  writeFileSync(join(cwd, 'test/adoption.test.ts'), 'export {}\n')
  git(cwd, ['add', 'FORK_NOTES.md', 'test/adoption.test.ts'])
  git(cwd, [
    'commit',
    '--quiet',
    '-m',
    'feat: preserve adoption behavior',
    '-m',
    'Fork-Customization: ORCAW-001'
  ])
  return { cwd }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

describe('fork upstream adoption', () => {
  it('validates a clean, exact replay and runs deduplicated verification paths once', () => {
    const fixture = makeCandidateRepository()
    const run = vi.fn()

    const result = runForkUpstreamAdoption({
      cwd: fixture.cwd,
      upstreamTag: 'v1.2.3',
      runVitest: run
    })

    expect(result).toEqual({ ids: ['ORCAW-001'], testPaths: ['test/adoption.test.ts'] })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(['test/adoption.test.ts'], { cwd: fixture.cwd })
  })

  it('allows untrailed maintenance commits but rejects a retained release commit', () => {
    const fixture = makeCandidateRepository()
    writeFileSync(join(fixture.cwd, 'docs.md'), 'maintenance\n')
    git(fixture.cwd, ['add', 'docs.md'])
    git(fixture.cwd, ['commit', '--quiet', '-m', 'docs: clarify migration'])

    expect(() =>
      runForkUpstreamAdoption({
        cwd: fixture.cwd,
        upstreamTag: 'v1.2.3',
        runVitest: vi.fn()
      })
    ).not.toThrow()

    git(fixture.cwd, [
      'commit',
      '--allow-empty',
      '--quiet',
      '-m',
      'chore(release): prepare v1.2.3-wyk.1'
    ])

    expect(() =>
      runForkUpstreamAdoption({
        cwd: fixture.cwd,
        upstreamTag: 'v1.2.3',
        runVitest: vi.fn()
      })
    ).toThrow('Candidate contains release commit')
  })

  it('selects one customization verification set with --id semantics', () => {
    const fixture = makeCandidateRepository()
    const run = vi.fn()

    runForkUpstreamAdoption({
      cwd: fixture.cwd,
      upstreamTag: 'v1.2.3',
      id: 'ORCAW-001',
      runVitest: run
    })

    expect(run).toHaveBeenCalledWith(['test/adoption.test.ts'], { cwd: fixture.cwd })
  })

  it('parses an optional customization ID without accepting duplicate flags', () => {
    expect(
      parseForkUpstreamAdoptionArguments(['v1.2.3', 'candidate', '--id', 'ORCAW-001'])
    ).toEqual({ upstreamTag: 'v1.2.3', candidateHead: 'candidate', id: 'ORCAW-001' })
    expect(() =>
      parseForkUpstreamAdoptionArguments(['v1.2.3', '--id', 'ORCAW-001', '--id', 'ORCAW-002'])
    ).toThrow('Usage: fork-upstream-adoption.mjs')
  })

  it('spawns one shell-free Vitest process with explicit path arguments', () => {
    const spawn = vi.fn(() => ({ status: 0 }))

    runVitest(['test/a.test.ts', 'test/b.test.ts'], { cwd: '/repo', spawn })

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config',
        'config/vitest.config.ts',
        '--',
        'test/a.test.ts',
        'test/b.test.ts'
      ],
      expect.objectContaining({ cwd: '/repo', shell: false, stdio: 'inherit' })
    )
  })
})
