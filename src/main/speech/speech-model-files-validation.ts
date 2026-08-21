import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { SpeechModelManifest } from '../../shared/speech-types'

export function validateSpeechModelFiles(manifest: SpeechModelManifest, modelDir: string): boolean {
  if (!manifest.downloadFiles) {
    return false
  }
  return manifest.downloadFiles.every(({ name, sizeBytes }) => {
    try {
      return statSync(join(modelDir, name)).size === sizeBytes
    } catch {
      return false
    }
  })
}
