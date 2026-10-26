import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>())
const showSaveDialog = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (name: string) => handlers.delete(name),
    handle: (name: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(name, handler)
  },
  dialog: { showSaveDialog }
}))
import { registerHtmlFileExportHandlers, validateMarkdownExport } from './export-html-file'

let directory: string | undefined
afterEach(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
  directory = undefined
  vi.clearAllMocks()
})
describe('standalone HTML export', () => {
  it('writes the exact UTF-8 document to the user-selected location', async () => {
    directory = await mkdtemp(join(tmpdir(), 'orcaw-export-'))
    const filePath = join(directory, '导出.html')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath })
    registerHtmlFileExportHandlers()
    const html = '<!doctype html>\r\n<html><body>原文 -> &gt;</body></html>'
    expect(
      await handlers.get('export:html-to-file')!(null, { html, title: 'name/with:separator' })
    ).toEqual({ success: true, filePath })
    expect(await readFile(filePath, 'utf8')).toBe(html)
    expect(showSaveDialog).toHaveBeenCalledWith({
      defaultPath: 'name_with_separator.html',
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
  })
  it('returns cancellation without writing and supports registering again', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true })
    registerHtmlFileExportHandlers()
    registerHtmlFileExportHandlers()
    expect(
      await handlers.get('export:html-to-file')!(null, { html: '<p>text</p>', title: 'Doc' })
    ).toEqual({ success: false, cancelled: true })
  })
  it('reports write errors without claiming success', async () => {
    directory = await mkdtemp(join(tmpdir(), 'orcaw-export-'))
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: directory })
    registerHtmlFileExportHandlers()
    expect(
      await handlers.get('export:html-to-file')!(null, { html: '<p>text</p>', title: 'Doc' })
    ).toMatchObject({ success: false, error: expect.any(String) })
  })
  it.each([null, {}, { html: '', title: 'Doc' }, { html: '<p>text</p>', title: null }])(
    'rejects invalid export requests before opening a dialog: %j',
    async (value) => {
      registerHtmlFileExportHandlers()
      expect(await handlers.get('export:html-to-file')!(null, value)).toEqual({
        success: false,
        error: 'Invalid export document'
      })
      expect(showSaveDialog).not.toHaveBeenCalled()
    }
  )
  it('rejects oversized requests and defaults an empty title', () => {
    expect(() =>
      validateMarkdownExport({ html: 'x'.repeat(64 * 1024 * 1024 + 1), title: 'Doc' })
    ).toThrow()
    expect(validateMarkdownExport({ html: '<p>ok</p>', title: '' }).title).toBe('export')
  })
})
