import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('./ipc-port', () => ({ ipcMain: { handle: vi.fn() } }))
import { createMarkdownScrollTraceWriter } from './markdown-scroll-diagnostics'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

it('serializes concurrent reports and rotates the log before it exceeds the size limit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcaw-scroll-trace-'))
  directories.push(directory)
  const write = createMarkdownScrollTraceWriter(directory)
  await Promise.all(
    Array.from({ length: 9 }, (_, index) =>
      write(
        JSON.stringify({
          schema: 1,
          entries: [{ event: 'scroll', index, padding: 'x'.repeat(280000) }]
        })
      )
    )
  )
  const reports: number[] = []
  for (const name of ['markdown-scroll.previous.jsonl', 'markdown-scroll.jsonl']) {
    const path = join(directory, name)
    const content = await readFile(path, 'utf8')
    reports.push(
      ...content
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).entries[0].index)
    )
    expect((await stat(path)).size).toBeLessThanOrEqual(2 * 1024 * 1024)
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o077).toBe(0)
    }
  }
  expect(reports).toEqual(Array.from({ length: 9 }, (_, index) => index))
})

it('rejects malformed or oversized input without preventing later valid reports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orcaw-scroll-trace-'))
  directories.push(directory)
  const write = createMarkdownScrollTraceWriter(directory)
  for (const invalid of [
    null,
    'invalid JSON',
    '{}',
    'x'.repeat(512 * 1024 + 1),
    JSON.stringify({ schema: 1, entries: Array.from({ length: 201 }, () => ({})) })
  ]) {
    await expect(write(invalid)).rejects.toThrow('Invalid Markdown scroll trace')
  }
  const report = JSON.stringify({ schema: 1, entries: [{ event: 'scroll', top: 300 }] })
  await write(report)
  expect(await readFile(join(directory, 'markdown-scroll.jsonl'), 'utf8')).toBe(`${report}\n`)
})
