import { useEffect } from 'react'
import { ORCA_PLUGINS_ENABLED } from '../../../shared/fork-feature-policy'
import { create } from 'zustand'
import type { PluginLanguagePackRegistration } from '../../../shared/plugins/plugin-language-pack-artifact'

type PluginLanguagePackState = {
  packs: PluginLanguagePackRegistration[]
  loaded: boolean
  fetchPacks: () => Promise<void>
}

let requestGeneration = 0
let changeSubscriptionStarted = false

export const usePluginLanguagePackStore = create<PluginLanguagePackState>()((set) => ({
  packs: [],
  loaded: false,
  fetchPacks: async () => {
    const generation = ++requestGeneration
    const api = window.api?.plugins
    if (!ORCA_PLUGINS_ENABLED || !api?.listLanguagePacks) {
      if (generation === requestGeneration) {
        set({ packs: [], loaded: true })
      }
      return
    }
    try {
      const packs = await api.listLanguagePacks()
      if (generation === requestGeneration) {
        set({ packs, loaded: true })
      }
    } catch {
      if (generation === requestGeneration) {
        set({ packs: [], loaded: true })
      }
    }
  }
}))

export function ensurePluginLanguagePacksLoaded(): void {
  const state = usePluginLanguagePackStore.getState()
  if (!state.loaded) {
    void state.fetchPacks()
  }
  if (ORCA_PLUGINS_ENABLED && !changeSubscriptionStarted && window.api?.plugins?.onChanged) {
    changeSubscriptionStarted = true
    window.api.plugins.onChanged((event) => {
      if (event?.contentPacksChanged ?? true) {
        void usePluginLanguagePackStore.getState().fetchPacks()
      }
    })
  }
}

export function usePluginLanguagePacks(): PluginLanguagePackRegistration[] {
  const packs = usePluginLanguagePackStore((state) => state.packs)
  useEffect(() => ensurePluginLanguagePacksLoaded(), [])
  return packs
}
