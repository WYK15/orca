// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAiVaultSessionSelection } from './ai-vault-session-selection'

describe('useAiVaultSessionSelection', () => {
  it('selects only the visible deletable sessions', () => {
    const { result } = renderHook(() => useAiVaultSessionSelection())

    act(() => result.current.enterSelectionMode())
    act(() => result.current.selectAll(['local-a', 'local-b']))

    expect(result.current.selectedSessionIds).toEqual(new Set(['local-a', 'local-b']))
  })

  it('keeps an existing visible selection when select all is toggled off', () => {
    const { result } = renderHook(() => useAiVaultSessionSelection())

    act(() => result.current.enterSelectionMode())
    act(() => result.current.toggleSession('local-a'))
    act(() => result.current.toggleAll(['local-a', 'local-b']))
    expect(result.current.selectedSessionIds).toEqual(new Set(['local-a', 'local-b']))

    act(() => result.current.toggleAll(['local-a', 'local-b']))
    expect(result.current.selectedSessionIds).toEqual(new Set())
  })

  it('removes deleted sessions from the selection without leaving selection mode', () => {
    const { result } = renderHook(() => useAiVaultSessionSelection())

    act(() => result.current.enterSelectionMode())
    act(() => result.current.selectAll(['local-a', 'local-b']))
    act(() => result.current.removeSessions(['local-a']))

    expect(result.current.selectionMode).toBe(true)
    expect(result.current.selectedSessionIds).toEqual(new Set(['local-b']))
  })
})
