import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as OsModule from 'node:os'
import { AntigravityHookService } from '../antigravity/hook-service'
import { CommandCodeHookService } from '../command-code/hook-service'
import { CursorHookService } from '../cursor/hook-service'
import { DroidHookService } from '../droid/hook-service'
import { GeminiHookService } from '../gemini/hook-service'
import { GrokHookService } from '../grok/hook-service'
import * as installerUtils from './installer-utils'

const home = vi.hoisted(() => ({ path: '' }))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof OsModule>()),
  homedir: () => home.path
}))
vi.mock('electron', () => ({ app: { getPath: () => home.path } }))

const services = [
  ['antigravity', () => new AntigravityHookService()],
  ['command-code', () => new CommandCodeHookService()],
  ['cursor', () => new CursorHookService()],
  ['droid', () => new DroidHookService()],
  ['gemini', () => new GeminiHookService()],
  ['grok', () => new GrokHookService()]
] as const

beforeEach(() => {
  home.path = mkdtempSync(join(tmpdir(), 'orcaw-hook-removal-'))
  vi.stubEnv('GROK_HOME', join(home.path, '.grok'))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(home.path, { recursive: true, force: true })
})

describe('ORCAW-008 hook removal safety', () => {
  it.each(services)(
    '%s removal leaves a missing config home untouched',
    (_agent, createService) => {
      expect(createService().remove().state).toBe('not_installed')
      expect(readdirSync(home.path)).toEqual([])
    }
  )

  it.each(services)(
    '%s removal fails from one unreadable snapshot without writing',
    (_agent, createService) => {
      const read = vi.spyOn(installerUtils, 'readHooksJsonWithRaw').mockReturnValue({
        state: 'unreadable',
        raw: null,
        config: null
      })
      const write = vi.spyOn(installerUtils, 'writeHooksJson')
      expect(createService().remove().state).toBe('error')
      expect(read).toHaveBeenCalledTimes(1)
      expect(write).not.toHaveBeenCalled()
      expect(readdirSync(home.path)).toEqual([])
    }
  )

  it.each(services)(
    '%s removal preserves malformed readable config bytes',
    (_agent, createService) => {
      const configPath = createService().getStatus().configPath!
      mkdirSync(dirname(configPath), { recursive: true })
      writeFileSync(configPath, 'not json\n')
      const write = vi.spyOn(installerUtils, 'writeHooksJson')
      expect(createService().remove().state).toBe('error')
      expect(write).not.toHaveBeenCalled()
      expect(existsSync(`${configPath}.bak`)).toBe(false)
      expect(readFileSync(configPath, 'utf8')).toBe('not json\n')
    }
  )
})
