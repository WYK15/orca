import { ipcMain } from 'electron'

export function registerUnavailableSpeechHandlers(): void {
  ipcMain.handle('speech:getCatalog', () => [])
  ipcMain.handle('speech:getModelStates', () => [])
  ipcMain.handle('speech:getOpenAiApiKeyStatus', () => ({ configured: false }))
  for (const channel of [
    'speech:saveOpenAiApiKey',
    'speech:clearOpenAiApiKey',
    'speech:downloadModel',
    'speech:deleteModel',
    'speech:startDictation',
    'speech:feedAudio'
  ]) {
    ipcMain.handle(channel, () => {
      throw new Error('voice_dictation_unavailable')
    })
  }
  ipcMain.handle('speech:cancelDownload', () => undefined)
  ipcMain.handle('speech:stopDictation', () => undefined)
}
