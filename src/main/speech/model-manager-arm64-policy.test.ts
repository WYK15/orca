import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, net: {} }))
vi.mock('./model-catalog', () => ({
  LOCAL_SPEECH_UNAVAILABLE_MESSAGE: 'Local speech recognition is unavailable on Windows ARM64.',
  isLocalSpeechSupported: () => false,
  isLocalSpeechModel: () => true,
  getCatalogModel: () => ({
    id: 'fixture-local',
    provider: 'local',
    files: ['model.onnx'],
    sizeBytes: 1,
    downloadFiles: [{ name: 'model.onnx', sizeBytes: 1 }]
  }),
  SPEECH_MODEL_CATALOG: []
}))

import { ModelManager } from './model-manager'

describe('Windows ARM64 local model download policy', () => {
  it('rejects a local download even when that model is already present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orcaw-arm64-model-policy-'))
    try {
      const modelDir = join(dir, 'fixture-local')
      mkdirSync(modelDir)
      writeFileSync(join(modelDir, 'model.onnx'), 'x')
      const manager = new ModelManager(dir)
      await expect(manager.downloadModel('fixture-local')).rejects.toThrow(
        'Local speech recognition is unavailable on Windows ARM64.'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
