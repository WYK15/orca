import type { ModelManager } from './model-manager'
import type { SttService } from './stt-service'
import type { VoiceSettings } from '../../shared/speech-types'

type SpeechSettingsStore = {
  getSettings(): {
    voice?: VoiceSettings
  }
}

export function getSpeechModelManager(_store: SpeechSettingsStore): ModelManager {
  throw new Error('voice_dictation_unavailable')
}

export function getSpeechSttService(_store: SpeechSettingsStore): SttService {
  throw new Error('voice_dictation_unavailable')
}
