import { readFileSync } from 'node:fs'
import { isDefinitiveAbsence } from '../../shared/definitive-filesystem-absence'
import type { HooksConfig } from './installer-utils'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type HooksJsonSnapshot =
  | { state: 'missing'; raw: null; config: HooksConfig }
  | { state: 'unreadable'; raw: null; config: null }
  | { state: 'readable'; raw: string; config: HooksConfig | null }

export function parseHooksJsonText(raw: string): HooksConfig | null {
  // Why: JSON.parse rejects a decoded UTF-8 BOM; strip only the leading marker.
  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  try {
    const parsed = JSON.parse(content)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Why: generation guards abort a mutation when the file no longer matches the
// bytes it was derived from; the raw snapshot and the parse must come from one
// read or a concurrent save can slip between them unnoticed.
export function readHooksJsonWithRaw(configPath: string): HooksJsonSnapshot {
  // Why: one read avoids a TOCTOU window and distinguishes absence from failures
  // that must never be treated as a writable empty config.
  try {
    const raw = readFileSync(configPath, 'utf-8')
    return { state: 'readable', raw, config: parseHooksJsonText(raw) }
  } catch (error) {
    return isDefinitiveAbsence(error)
      ? { state: 'missing', raw: null, config: {} }
      : { state: 'unreadable', raw: null, config: null }
  }
}

export function readHooksJson(configPath: string): HooksConfig | null {
  return readHooksJsonWithRaw(configPath).config
}
