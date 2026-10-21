import { describe, expect, it } from 'vitest'
import { validateTauriReleaseSource } from './tauri-release-source.mjs'

const source = {
  tag: 'v1.4.165-wyk.22-tauri.1',
  version: '1.4.165-wyk.22-tauri.1',
  tauriVersion: '1.4.165-wyk.22-tauri.1',
  commit: 'tagged-commit',
  tagCommit: 'tagged-commit'
}

describe('Tauri release source', () => {
  it('accepts a matching immutable prerelease tag', () => {
    expect(validateTauriReleaseSource(source)).toBe(source.tag)
  })
  it.each(['refactor/tauri-desktop', 'v1.4.165-wyk.22', '', undefined])(
    'rejects a branch, Electron tag, or missing tag: %s',
    (tag) => {
      expect(() => validateTauriReleaseSource({ ...source, tag })).toThrow('existing')
    }
  )
  it.each([
    { version: '1.4.165-wyk.21' },
    { tauriVersion: '1.4.165-wyk.21' },
    { tagCommit: 'different-commit' },
    { commit: '' }
  ])('rejects mixed version/source identity: %j', (override) => {
    expect(() => validateTauriReleaseSource({ ...source, ...override })).toThrow()
  })
})
