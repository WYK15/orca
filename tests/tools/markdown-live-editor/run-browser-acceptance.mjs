import { spawn, spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'orcaw-markdown-acceptance-'))
const scripts = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'verify',
      'verify-table-interactions',
      'verify-writing-interactions',
      'verify-list-editing',
      'verify-list-code-exit',
      'verify-container-editing',
      'verify-contextual-insertion',
      'verify-document-features',
      'verify-table-grid',
      'verify-resources-and-export',
      'verify-image-layout',
      'verify-media-lifecycle',
      'verify-editing-boundaries',
      'verify-large-documents'
    ]
function stop(child, force = false) {
  if (!child?.pid) {
    return
  }
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
    }
  } catch {
    /* Process already exited. */
  }
}
async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
const port = await availablePort()
const url = `http://127.0.0.1:${port}`
const serverLog = openSync(join(directory, 'server.log'), 'w')
const server = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    '--config',
    'tests/tools/markdown-live-editor/vite.config.ts',
    '--port',
    String(port)
  ],
  { stdio: ['ignore', serverLog, serverLog], detached: process.platform !== 'win32' }
)
const results = []
let running
try {
  let ready = false
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      ready = (await fetch(`${url}/fixture`)).ok
    } catch {
      /* Vite is starting. */
    }
    if (ready) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (!ready) {
    throw new Error(`Fixture server failed: ${readFileSync(join(directory, 'server.log'), 'utf8')}`)
  }
  console.log(`Artifacts: ${directory}`)
  for (const browser of ['chrome', 'webkit']) {
    for (const script of scripts) {
      if (!/^[\w-]+$/.test(script)) {
        throw new Error('Invalid check name')
      }
      const log = join(directory, `${browser}-${script}.log`)
      const fd = openSync(log, 'w')
      const started = Date.now()
      let timedOut = false
      running = spawn(process.execPath, [`tests/tools/markdown-live-editor/${script}.mjs`], {
        env: { ...process.env, ORCA_MARKDOWN_CHECK_URL: url, ORCA_MARKDOWN_CHECK_BROWSER: browser },
        stdio: ['ignore', fd, fd],
        detached: process.platform !== 'win32'
      })
      const child = running
      const deadline = setTimeout(() => {
        timedOut = true
        stop(child)
        setTimeout(() => stop(child, true), 2000).unref()
      }, 60000)
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code) => resolve(code))
      })
      clearTimeout(deadline)
      closeSync(fd)
      running = undefined
      const output = readFileSync(log, 'utf8')
      const result = {
        browser,
        script,
        passed: code === 0 && !timedOut,
        timedOut,
        code,
        durationMs: Date.now() - started,
        workflows: output.split('\n').filter((line) => line.startsWith('PASS:')).length,
        log
      }
      results.push(result)
      writeFileSync(
        join(directory, 'results.json'),
        JSON.stringify({ completedAt: new Date().toISOString(), results }, null, 2)
      )
      console.log(
        `${result.passed ? 'PASS' : 'FAIL'} ${browser}/${script} (${result.durationMs} ms)`
      )
      if (!result.passed) {
        console.error(output.slice(-4000))
      }
    }
  }
  if (results.some((result) => !result.passed)) {
    process.exitCode = 1
  }
} finally {
  stop(running)
  stop(server)
  closeSync(serverLog)
}
