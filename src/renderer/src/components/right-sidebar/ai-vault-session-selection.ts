import { useCallback, useState } from 'react'

export function useAiVaultSessionSelection() {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set())
  const toggleSession = useCallback((id: string) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
  const toggleAll = useCallback((ids: readonly string[]) => {
    setSelectedSessionIds((current) =>
      ids.length > 0 && ids.every((id) => current.has(id)) ? new Set() : new Set(ids)
    )
  }, [])
  const removeSessions = useCallback((ids: readonly string[]) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      for (const id of ids) {
        next.delete(id)
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
    toggleAll,
    removeSessions
  }
}
