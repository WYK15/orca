import { useCallback, useState } from 'react'

export function useAiVaultSessionSelection(): {
  selectionMode: boolean
  selectedSessionIds: ReadonlySet<string>
  enterSelectionMode: () => void
  exitSelectionMode: () => void
  toggleSession: (sessionId: string) => void
  selectAll: (sessionIds: readonly string[]) => void
  toggleAll: (sessionIds: readonly string[]) => void
  removeSessions: (sessionIds: readonly string[]) => void
} {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set())

  const toggleSession = useCallback((sessionId: string) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((sessionIds: readonly string[]) => {
    setSelectedSessionIds(new Set(sessionIds))
  }, [])

  const toggleAll = useCallback((sessionIds: readonly string[]) => {
    setSelectedSessionIds((current) => {
      const allSelected =
        sessionIds.length > 0 && sessionIds.every((sessionId) => current.has(sessionId))
      return allSelected ? new Set() : new Set(sessionIds)
    })
  }, [])

  const removeSessions = useCallback((sessionIds: readonly string[]) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      for (const sessionId of sessionIds) {
        next.delete(sessionId)
      }
      return next
    })
  }, [])

  const enterSelectionMode = useCallback(() => setSelectionMode(true), [])
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedSessionIds(new Set())
  }, [])

  return {
    selectionMode,
    selectedSessionIds,
    enterSelectionMode,
    exitSelectionMode,
    toggleSession,
    selectAll,
    toggleAll,
    removeSessions
  }
}
