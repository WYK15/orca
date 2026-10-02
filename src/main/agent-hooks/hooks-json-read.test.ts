import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readHooksJsonWithRaw } from './hooks-json-read'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orcaw-hook-snapshot-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('hook configuration snapshot states', () => {
  it('distinguishes missing from unreadable without an existence precheck', () => {
    const configPath = join(root, 'hooks.json')
    expect(readHooksJsonWithRaw(configPath)).toEqual({ state: 'missing', raw: null, config: {} })
    mkdirSync(configPath)
    expect(readHooksJsonWithRaw(configPath)).toEqual({
      state: 'unreadable',
      raw: null,
      config: null
    })
  })

  it('classifies a non-directory ancestor as definitive absence', () => {
    const ancestor = join(root, 'not-a-directory')
    writeFileSync(ancestor, 'text')
    expect(readHooksJsonWithRaw(join(ancestor, 'hooks.json'))).toEqual({
      state: 'missing',
      raw: null,
      config: {}
    })
  })

  it('retains exact readable bytes even when parsing fails', () => {
    const configPath = join(root, 'hooks.json')
    writeFileSync(configPath, 'not json\n')
    expect(readHooksJsonWithRaw(configPath)).toEqual({
      state: 'readable',
      raw: 'not json\n',
      config: null
    })
  })
})
