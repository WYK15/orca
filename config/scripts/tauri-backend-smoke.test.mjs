import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn, execFile } from 'node:child_process'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, '../..')
let directory
let project
let host
let sequence = 0
let diagnostics = ''
let events = []
let pending = new Map()

function call(channel, args = [], kind = 'invoke') {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${channel} timed out: ${diagnostics}`))
    }, 15_000)
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      }
    })
    host.stdin.write(`${JSON.stringify({ id, channel, args, kind })}\n`)
  })
}

describe('standalone desktop backend', () => {
  beforeAll(async () => {
    await execute(process.execPath, ['config/scripts/build-tauri-backend.mjs'], { cwd: root })
  })

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orcaw-tauri-test-'))
    project = join(directory, 'project')
    await mkdir(project)
    events = []
    diagnostics = ''
    pending = new Map()
    host = spawn(process.execPath, [join(root, 'out/tauri-backend/desktop-host.cjs')], {
      cwd: root,
      env: {
        ...process.env,
        ORCA_TAURI_USER_DATA: join(directory, 'data'),
        ORCA_TAURI_APP_ROOT: join(root, 'out/tauri-backend'),
        ORCA_TAURI_RESOURCES: join(root, 'out/tauri-resources')
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    host.stderr.on('data', (chunk) => {
      diagnostics += chunk
    })
    createInterface({ input: host.stdout }).on('line', (line) => {
      const frame = JSON.parse(line)
      if (frame.kind === 'event') {
        events.push(frame)
      }
      if (frame.kind === 'result') {
        const request = pending.get(frame.id)
        pending.delete(frame.id)
        if (frame.error) {
          request?.reject(new Error(frame.error))
        } else {
          request?.resolve(frame.value)
        }
      }
    })
    const bootstrap = await call('desktop:bootstrap')
    expect(bootstrap.platform).toBe(process.platform)
    await call('settings:set', [{ workspaceDir: join(directory, 'workspaces') }])
  })

  afterEach(async () => {
    if (host?.exitCode === null) {
      const exited = once(host, 'exit')
      host.stdin.end()
      const timeout = setTimeout(() => host.kill('SIGKILL'), 8_000)
      await exited
      clearTimeout(timeout)
    }
    for (const request of pending.values()) {
      request.reject(new Error('Test finished'))
    }
    if (directory) {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('edits and searches an ordinary folder while enforcing file access boundaries', async () => {
    await writeFile(join(project, 'note.md'), '# 原文\n\nA -> B\n')
    const added = await call('repos:add', [{ path: project, kind: 'folder' }])
    expect(added.repo.kind).toBe('folder')
    const file = join(project, 'note.md')
    const result = await call('fs:readFile', [{ filePath: file }])
    expect(result.content).toBe('# 原文\n\nA -> B\n')
    await call('fs:writeFile', [{ filePath: file, content: '# 原文\n\nA -> 新内容\n' }])
    expect(await readFile(file, 'utf8')).toBe('# 原文\n\nA -> 新内容\n')
    const found = await call('fs:search', [{ rootPath: project, query: '新内容' }])
    expect(JSON.stringify(found)).toContain('新内容')
    const outside = join(directory, 'outside.txt')
    await writeFile(outside, 'private')
    await expect(call('fs:readFile', [{ filePath: outside }])).rejects.toThrow('Access denied')
  })

  it('reuses Git operations for registered repositories', async () => {
    await execute('git', ['init', project])
    await writeFile(join(project, 'new.txt'), 'new\n')
    const added = await call('repos:add', [{ path: project, kind: 'git' }])
    expect(added.repo.kind).toBe('git')
    const status = await call('git:status', [{ worktreePath: project }])
    expect(JSON.stringify(status)).toContain('new.txt')
  })

  it('starts a real native terminal and accepts input through the new IPC port', async () => {
    await call('pty:rendererDispatcherReady', [], 'send')
    const terminal = await call('pty:spawn', [{ cwd: project, cols: 80, rows: 24 }])
    expect(typeof terminal.id).toBe('string')
    expect(await call('pty:hasPty', [{ id: terminal.id }])).toBe(true)
    await call('pty:writeAccepted', [
      { id: terminal.id, data: "printf 'tauri-stdio-terminal\\n'\r" }
    ])
    await expect
      .poll(() => JSON.stringify(events), { timeout: 10_000 })
      .toContain('tauri-stdio-terminal')
    await call('pty:kill', [{ id: terminal.id }])
    expect(await call('pty:hasPty', [{ id: terminal.id }])).toBe(false)
  })

  it('retains SSH target CRUD and reports unmigrated operations explicitly', async () => {
    expect(await call('ssh:listTargets')).toEqual([])
    const target = await call('ssh:addTarget', [
      { target: { label: 'Fixture', host: 'example.invalid', port: 22, username: 'tester' } }
    ])
    expect(JSON.stringify(target)).toContain('example.invalid')
    expect(await call('ssh:listTargets')).toHaveLength(1)
    await expect(call('unmigrated:operation')).rejects.toThrow('has not been migrated')
    await call('desktop:flush')
  })
})
