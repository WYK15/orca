import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { desktopPath } from './desktop-context'
import { ipcMain } from './ipc-port'

const maximumBytes = 2 * 1024 * 1024

export function createMarkdownScrollTraceWriter(directory: string) {
  let pending = Promise.resolve()
  return (trace: unknown): Promise<void> => {
    if (typeof trace !== 'string' || Buffer.byteLength(trace) > 512 * 1024) {
      return Promise.reject(new Error('Invalid Markdown scroll trace size'))
    }
    let serialized: string
    try {
      const report = JSON.parse(trace)
      if (report?.schema !== 1 || !Array.isArray(report.entries) || report.entries.length > 200) {
        throw new Error('Invalid Markdown scroll trace')
      }
      serialized = JSON.stringify(report)
    } catch {
      return Promise.reject(new Error('Invalid Markdown scroll trace'))
    }
    const write = pending.then(async () => {
      await mkdir(directory, { recursive: true })
      const path = join(directory, 'markdown-scroll.jsonl')
      const size = await stat(path).then(
        (file) => file.size,
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') {
            throw error
          }
          return 0
        }
      )
      if (size + Buffer.byteLength(serialized) + 1 > maximumBytes) {
        await rename(path, join(directory, 'markdown-scroll.previous.jsonl'))
      }
      await appendFile(path, `${serialized}\n`, { mode: 0o600 })
    })
    pending = write.catch(() => {})
    return write
  }
}

export function registerMarkdownScrollDiagnostics(): void {
  const write = createMarkdownScrollTraceWriter(desktopPath('logs'))
  ipcMain.handle('diagnostics:recordMarkdownScrollTrace', (_event, trace: unknown) => write(trace))
}
