import { useSyncExternalStore } from 'react'

export type MarkdownWritingPreferences = {
  focus: boolean
  typewriter: boolean
  spellcheck: boolean
  width: 'full' | 'reading'
  imageFolder: string
}
export const defaultMarkdownWritingPreferences: MarkdownWritingPreferences = {
  focus: false,
  typewriter: false,
  spellcheck: false,
  width: 'full',
  imageFolder: ''
}
const key = 'orcaw.markdown.writing.v1'
const listeners = new Set<() => void>()
let cached: MarkdownWritingPreferences | undefined

export function validMarkdownImageFolder(value: string): boolean {
  return (
    !/^[\\/~]|^[a-z]:|[<>:"|?*]/i.test(value) &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32) &&
    value
      .replaceAll('\\', '/')
      .split('/')
      .every((part) => part !== '..')
  )
}

export function readMarkdownWritingPreferences(): MarkdownWritingPreferences {
  if (!cached) {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '{}')
      cached = {
        focus: value.focus === true,
        typewriter: value.typewriter === true,
        spellcheck: value.spellcheck === true,
        width: value.width === 'reading' ? 'reading' : 'full',
        imageFolder:
          typeof value.imageFolder === 'string' && validMarkdownImageFolder(value.imageFolder)
            ? value.imageFolder
            : ''
      }
    } catch {
      cached = { ...defaultMarkdownWritingPreferences }
    }
  }
  return cached
}

export function setMarkdownWritingPreferences(change: Partial<MarkdownWritingPreferences>): void {
  cached = { ...readMarkdownWritingPreferences(), ...change }
  try {
    localStorage.setItem(key, JSON.stringify(cached))
  } catch {
    /* Private storage can be unavailable. */
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  const storage = (event: StorageEvent): void => {
    if (event.key === key || event.key === null) {
      cached = undefined
      listener()
    }
  }
  listeners.add(listener)
  window.addEventListener('storage', storage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', storage)
  }
}
export const useMarkdownWritingPreferences = (): MarkdownWritingPreferences =>
  useSyncExternalStore(subscribe, readMarkdownWritingPreferences, readMarkdownWritingPreferences)
