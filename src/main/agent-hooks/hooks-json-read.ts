import { readFileSync } from 'node:fs'
import type { HooksConfig } from './installer-utils'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type HooksJsonSnapshot =
  | { state: 'missing'; raw: null; config: HooksConfig }
  | { state: 'unreadable'; raw: null; config: null }
  | { state: 'readable'; raw: string; config: HooksConfig | null }

// Why: generation guards abort a mutation when the file no longer matches the
// bytes it was derived from; the raw snapshot and the parse must come from one
// read or a concurrent save can slip between them unnoticed.
export function readHooksJsonWithRaw(configPath: string): HooksJsonSnapshot {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR'
      ? { state: 'missing', raw: null, config: {} }
      : { state: 'unreadable', raw: null, config: null }
  }
  try {
    const parsed = JSON.parse(raw)
    return { state: 'readable', raw, config: isPlainObject(parsed) ? parsed : null }
  } catch {
    return { state: 'readable', raw, config: null }
  }
}

export function readHooksJson(configPath: string): HooksConfig | null {
  return readHooksJsonWithRaw(configPath).config
}
