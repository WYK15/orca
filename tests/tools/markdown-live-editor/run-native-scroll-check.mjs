import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin') {
  console.log('SKIP: native WKWebView scroll regression requires macOS')
  process.exit(0)
}
const directory = mkdtempSync(join(tmpdir(), 'orcaw-native-scroll-'))
const table = [
  '| Field | Description |',
  '| --- | --- |',
  ...Array.from(
    { length: 8 },
    (_, index) => `| Field ${index} | ${'设备信息和服务端参数的说明。'.repeat(3)} |`
  )
].join('\n')
const fixture = join(directory, 'report.md')
writeFileSync(
  fixture,
  [
    '# Native scrolling',
    '## Sequence',
    '```mermaid\nsequenceDiagram\nparticipant C as Client\nparticipant S as Server\nparticipant F as Probe service\nC->>S: Load page and configuration\nS-->>C: Return parameters and session data\nC->>C: Initialize and collect device data\nC->>F: Request network probe\nF-->>C: Return probe body\nC->>C: Cache results\nloop Business requests\nC->>C: Reuse cached results\nC->>C: Encode collected data and split fields\nC->>S: Send request with generated headers\nend\n```',
    '## First table',
    table,
    '## Second table',
    table,
    '## Third table',
    table,
    ...Array.from({ length: 24 }, (_, index) => `Tail paragraph ${index}.`)
  ].join('\n\n')
)
const socket = createServer()
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise((resolve) => socket.close(resolve))
const url = `http://127.0.0.1:${port}`
const server = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    '--config',
    'tests/tools/markdown-live-editor/vite.config.ts',
    '--port',
    String(port),
    '--strictPort'
  ],
  { stdio: 'ignore', detached: true }
)
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(`${url}/fixture`)).ok
    } catch {
      /* Server is starting. */
    }
    if (ready) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!ready) {
    throw new Error('Native scroll fixture server failed to start')
  }
  const result = spawnSync(
    'swift',
    ['tests/tools/markdown-live-editor/native-scroll-check.swift'],
    {
      env: {
        ...process.env,
        ORCA_MARKDOWN_CHECK_URL: url,
        ORCA_MARKDOWN_SCROLL_FIXTURE: process.env.ORCA_MARKDOWN_SCROLL_FIXTURE || fixture,
        ORCA_MARKDOWN_CHECK_ARTIFACTS: directory
      },
      stdio: 'inherit',
      timeout: 60000
    }
  )
  if (result.error) {
    throw result.error
  }
  console.log(`Artifacts: ${directory}`)
  process.exitCode = result.status ?? 1
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    /* Server already exited. */
  }
}
