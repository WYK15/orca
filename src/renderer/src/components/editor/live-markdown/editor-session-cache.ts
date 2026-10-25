import type { EditorState } from '@codemirror/state'
import { markdownSourceField } from './source-document'

type EditorSession = { state: EditorState; scrollTop: number; bytes: number }
const sessions = new Map<string, EditorSession>()
const MAX_BYTES = 16 * 1024 * 1024

export function readMarkdownEditorSession(key: string, source: string): EditorSession | undefined {
  const session = sessions.get(key)
  sessions.delete(key)
  if (session?.state.field(markdownSourceField).raw === source) {
    return session
  }
  return undefined
}

export function cacheMarkdownEditorSession(
  key: string,
  state: EditorState,
  scrollTop: number
): void {
  sessions.delete(key)
  const bytes = state.field(markdownSourceField).raw.length * 4
  if (bytes > MAX_BYTES) {
    return
  }
  sessions.set(key, { state, scrollTop, bytes })
  let total = [...sessions.values()].reduce((sum, session) => sum + session.bytes, 0)
  while (total > MAX_BYTES || sessions.size > 12) {
    const oldest = sessions.entries().next().value
    if (!oldest) {
      break
    }
    total -= oldest[1].bytes
    sessions.delete(oldest[0])
  }
}
