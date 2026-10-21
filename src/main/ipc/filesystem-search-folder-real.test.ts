import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { searchWithGitGrep } from './filesystem-search-git'
import { searchWithGitGrep as searchRelay } from '../../relay/fs-handler-git-fallback'

describe.each(['local', 'relay'] as const)('%s folder text search without rg', (host) => {
  let rootPath = ''

  afterEach(() => {
    if (rootPath) {
      rmSync(rootPath, { recursive: true, force: true })
    }
  })

  it('searches a plain folder, nested repositories and filtered Unicode paths', async () => {
    rootPath = mkdtempSync(join(tmpdir(), 'orca-folder-search-'))
    mkdirSync(join(rootPath, '资料'))
    mkdirSync(join(rootPath, 'nested'))
    execFileSync('git', ['init', '-q'], { cwd: join(rootPath, 'nested') })
    writeFileSync(join(rootPath, '资料', '说明.md'), 'HOST host\n')
    writeFileSync(join(rootPath, 'other.txt'), 'HOST\n')
    writeFileSync(join(rootPath, 'nested', 'app.js'), 'HOST\n')
    writeFileSync(join(rootPath, 'nested', '.git', 'private-note'), 'HOST\n')
    const search = (filters = {}) =>
      host === 'local'
        ? searchWithGitGrep(rootPath, { rootPath, query: 'HOST', ...filters }, 100)
        : searchRelay(rootPath, 'HOST', { maxResults: 100, ...filters })

    const result = await search()
    expect(result.totalMatches).toBe(4)
    expect(result.files.map((file) => file.relativePath).sort()).toEqual([
      'nested/app.js',
      'other.txt',
      '资料/说明.md'
    ])
    const filtered = await search({ includePattern: '*.md', caseSensitive: true })
    expect(filtered.totalMatches).toBe(1)
    expect(filtered.files[0].relativePath).toBe('资料/说明.md')
    const excluded = await search({ excludePattern: '资料/**' })
    expect(excluded.totalMatches).toBe(2)
  })
})
