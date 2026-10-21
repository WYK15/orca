import { describe, expect, it } from 'vitest'
import { buildFolderGitGrepArgs, isGitGrepOutsideRepository } from './git-grep-folder-fallback'

describe('folder grep fallback', () => {
  it('only retries a repository discovery failure', () => {
    expect(
      isGitGrepOutsideRepository(128, 'fatal: not a git repository (or any parent): .git\n')
    ).toBe(true)
    expect(isGitGrepOutsideRepository(128, 'fatal: detected dubious ownership')).toBe(false)
    expect(isGitGrepOutsideRepository(129, 'error: unknown option')).toBe(false)
    expect(isGitGrepOutsideRepository(1, '')).toBe(false)
    expect(isGitGrepOutsideRepository(null, '')).toBe(false)
  })

  it('retains global options and filters without combining incompatible modes', () => {
    const args = buildFolderGitGrepArgs('HOST', {
      includePattern: '*.md',
      excludePattern: 'dist/**'
    })
    expect(args.slice(0, 3)).toEqual(['-c', 'submodule.recurse=false', 'grep'])
    expect(args).toContain('--no-index')
    expect(args).toContain('--exclude-standard')
    expect(args).not.toContain('--untracked')
    expect(args).toContain(':(glob)**/*.md')
    expect(args).toContain(':(exclude,glob)dist/**')
  })
})
