import { beforeEach, expect, it, vi } from 'vitest'
import { registerUnavailableSpeechHandlers } from './speech-unavailable-handlers'
import { getSpeechModelManager, getSpeechSttService } from '../speech/speech-runtime-service'

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, () => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: () => unknown) => handlers.set(channel, handler) }
}))

beforeEach(() => {
  handlers.clear()
  registerUnavailableSpeechHandlers()
})

it('exposes no catalog, models or configured cloud credentials', () => {
  expect(handlers.get('speech:getCatalog')?.()).toEqual([])
  expect(handlers.get('speech:getModelStates')?.()).toEqual([])
  expect(handlers.get('speech:getOpenAiApiKeyStatus')?.()).toEqual({ configured: false })
})

it('rejects recording and downloads even when legacy settings enabled speech', () => {
  const store = { getSettings: vi.fn(() => ({ voice: { enabled: true } })) }
  expect(() => getSpeechModelManager(store as never)).toThrow('voice_dictation_unavailable')
  expect(() => getSpeechSttService(store as never)).toThrow('voice_dictation_unavailable')
  expect(store.getSettings).not.toHaveBeenCalled()
  for (const channel of [
    'speech:downloadModel',
    'speech:startDictation',
    'speech:saveOpenAiApiKey'
  ]) {
    expect(() => handlers.get(channel)?.()).toThrow('voice_dictation_unavailable')
  }
})
