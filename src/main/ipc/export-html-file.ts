import { dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'

export function validateMarkdownExport(args: unknown): { html: string; title: string } {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid export document')
  }
  const { html, title } = args as { html?: unknown; title?: unknown }
  if (
    typeof html !== 'string' ||
    !html.trim() ||
    html.length > 64 * 1024 * 1024 ||
    typeof title !== 'string'
  ) {
    throw new Error('Invalid export document')
  }
  return { html, title: title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 100) || 'export' }
}

export function registerHtmlFileExportHandlers(): void {
  ipcMain.removeHandler('export:html-to-file')
  ipcMain.handle('export:html-to-file', async (_event, args: unknown) => {
    try {
      const { html, title } = validateMarkdownExport(args)
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `${title}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }]
      })
      if (canceled || !filePath) {
        return { success: false, cancelled: true }
      }
      await writeFile(filePath, html, 'utf8')
      return { success: true, filePath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
