import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn, execFile } from 'node:child_process'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { startPluginWorker } from '../../src/main/plugins/plugin-host-process'

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, '../..')
let directory
let project
let host
let sequence = 0
let diagnostics = ''
let events = []
let pending = new Map()
let nativeRequests = []
let nativeResponses = new Map()

async function startHost() {
  const env = {
    ...process.env,
    ORCA_TAURI_USER_DATA: join(directory, 'data'),
    ORCA_TAURI_APP_ROOT: join(root, 'out/tauri-backend'),
    ORCA_TAURI_RESOURCES: join(root, 'out/tauri-resources')
  }
  delete env.VITEST
  host = spawn(process.execPath, [join(root, 'out/tauri-backend/desktop-host.cjs')], {
    cwd: root,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  host.stderr.on('data', (chunk) => {
    diagnostics += chunk
  })
  createInterface({ input: host.stdout }).on('line', (line) => {
    const frame = JSON.parse(line)
    if (frame.kind === 'native') {
      nativeRequests.push(frame)
      const response = nativeResponses.has(frame.channel)
        ? { value: nativeResponses.get(frame.channel) }
        : { error: `Unexpected native operation: ${frame.channel}` }
      host.stdin.write(`${JSON.stringify({ kind: 'native-result', id: frame.id, ...response })}\n`)
    }
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
  return call('desktop:bootstrap')
}

async function stopHost() {
  if (host?.exitCode === null) {
    const exited = once(host, 'exit')
    host.stdin.end()
    const timeout = setTimeout(() => host.kill('SIGKILL'), 8_000)
    const [code] = await exited
    clearTimeout(timeout)
    expect(code, diagnostics).toBe(0)
  }
}

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
    nativeRequests = []
    nativeResponses = new Map([
      ['credential-key', Buffer.alloc(32, 42).toString('base64')],
      ['menu-set', null]
    ])
    const bootstrap = await startHost()
    expect(bootstrap.platform).toBe(process.platform)
    await call('settings:set', [{ workspaceDir: join(directory, 'workspaces') }])
  })

  afterEach(async () => {
    if (host?.exitCode === null) {
      await call('app:awaitFirstWindowStartupServices')
      await call('pty:management:killAll')
    }
    await stopHost()
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

  it('reattaches the same live shell after the desktop backend restarts', async () => {
    await call('pty:rendererDispatcherReady', [], 'send')
    const original = await call('pty:spawn', [{ cwd: project, cols: 80, rows: 24 }])
    const before = await call('pty:management:listSessions')
    const session = before.sessions.find((entry) => entry.sessionId === original.id)
    expect(session, diagnostics).toBeDefined()
    expect(session.isAlive).toBe(true)
    expect(session.pid).toBeGreaterThan(0)
    await stopHost()
    await startHost()
    await call('app:awaitFirstWindowStartupServices')
    const retained = await call('pty:management:listSessions')
    expect(retained.sessions.find((entry) => entry.sessionId === original.id)?.pid).toBe(
      session.pid
    )
    await call('pty:rendererDispatcherReady', [], 'send')
    const attached = await call('pty:spawn', [
      { cwd: project, cols: 80, rows: 24, sessionId: original.id }
    ])
    expect(attached.id).toBe(original.id)
    expect(attached.pid).toBe(session.pid)
    const crashed = once(host, 'exit')
    host.kill('SIGKILL')
    await crashed
    await startHost()
    await call('app:awaitFirstWindowStartupServices')
    const recovered = await call('pty:management:listSessions')
    expect(recovered.sessions.find((entry) => entry.sessionId === original.id)?.pid).toBe(
      session.pid
    )
    await call('pty:rendererDispatcherReady', [], 'send')
    await call('pty:spawn', [{ cwd: project, cols: 80, rows: 24, sessionId: original.id }])
    events = []
    await call('pty:writeAccepted', [{ id: attached.id, data: 'echo tauri-retained-shell\r' }])
    await expect
      .poll(() => JSON.stringify(events), { timeout: 10_000 })
      .toContain('tauri-retained-shell')
  })

  it('authenticates agent hook events and forwards them to the renderer', async () => {
    await call('app:awaitFirstWindowStartupServices')
    const filename = process.platform === 'win32' ? 'endpoint.cmd' : 'endpoint.env'
    const endpoint = await readFile(join(directory, 'data/agent-hooks', filename), 'utf8')
    const env = Object.fromEntries(
      endpoint
        .trim()
        .split(/\r?\n/)
        .map((line) => line.replace(/^set /, '').split('='))
    )
    const url = `http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/codex`
    const paneKey = 'tab-1:11111111-1111-4111-8111-111111111111'
    const body = JSON.stringify({
      paneKey,
      tabId: 'tab-1',
      env: 'tauri',
      payload: { hook_event_name: 'UserPromptSubmit', prompt: 'tauri-agent-status' }
    })
    const rejected = await fetch(url, { method: 'POST', body })
    expect(rejected.status).toBe(403)
    const accepted = await fetch(url, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
      }
    })
    expect(accepted.status).toBe(204)
    await expect.poll(() => JSON.stringify(events)).toContain('tauri-agent-status')
    expect(await call('agentStatus:getSnapshot')).toEqual(
      expect.arrayContaining([expect.objectContaining({ paneKey, state: 'working' })])
    )
  })

  it('executes and shuts down a plugin with the packaged worker entry', async () => {
    await writeFile(
      join(project, 'worker.mjs'),
      `export default function(orca) {
      orca.commands.register('run', async (args) => ({ input: args, runtime: process.versions.node }))
    }`
    )
    const worker = await startPluginWorker({
      pluginId: 'fixture.smoke',
      rootDir: project,
      mainEntry: 'worker.mjs',
      entryPath: join(root, 'out/tauri-backend/plugin-host-entry.js'),
      grantedCapabilities: [],
      executeHostCall: async () => ({ ok: true, value: null }),
      log: () => {}
    })
    try {
      expect(await worker.invokeCommand('run', 'tauri-plugin-worker')).toEqual({
        input: 'tauri-plugin-worker',
        runtime: process.versions.node
      })
    } finally {
      await worker.dispose()
    }
  })

  it('routes image paste through native clipboard and checks copied file access', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII='
    nativeResponses.set('clipboard-read-image', png)
    nativeResponses.set('clipboard-write-image', null)
    nativeResponses.set('clipboard-write-file', null)
    await call('clipboard:writeImage', [`data:image/png;base64,${png}`])
    const file = await call('clipboard:saveImageAsTempFile')
    try {
      expect(await readFile(file)).toEqual(Buffer.from(png, 'base64'))
    } finally {
      await rm(file, { force: true })
    }
    nativeResponses.set('clipboard-read-image', null)
    expect(await call('clipboard:saveImageAsTempFile')).toBeNull()
    const local = join(project, 'copy.png')
    await writeFile(local, Buffer.from(png, 'base64'))
    await call('repos:add', [{ path: project, kind: 'folder' }])
    expect(await call('clipboard:writeFile', [{ filePath: local }])).toEqual({ ok: true })
    const outside = join(directory, 'private.png')
    await writeFile(outside, 'private')
    expect(await call('clipboard:writeFile', [outside])).toEqual({
      ok: false,
      reason: 'access-denied'
    })
    await expect(call('clipboard:writeImage', ['data:image/svg+xml;base64,AAAA'])).rejects.toThrow(
      'PNG'
    )
    expect(nativeRequests.filter((frame) => frame.channel === 'clipboard-write-file')).toEqual([
      expect.objectContaining({ args: [await realpath(local)] })
    ])
  })

  it('persists encrypted credentials and unlocks them after a backend restart', async () => {
    const token = 'tauri-private-cookie-fixture'
    await call('settings:set', [{ opencodeSessionCookie: token }])
    await call('desktop:flush')
    const file = await readFile(join(directory, 'data/orca-data.json'), 'utf8')
    expect(file).not.toContain(token)
    const saved = JSON.parse(file).settings.opencodeSessionCookie
    expect(typeof saved).toBe('string')
    expect(saved).not.toBe(token)
    await stopHost()
    await startHost()
    expect((await call('settings:get')).opencodeSessionCookie).toBe(token)
    await expect(call('credential-key')).rejects.toThrow('has not been migrated')
  })

  it('installs the existing menu definition and routes a native click to the UI', async () => {
    await call('settings:set', [{ uiLanguage: 'en' }])
    const flatten = (items) => items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])
    let settings
    await expect
      .poll(() => {
        const requests = nativeRequests.filter((frame) => frame.channel === 'menu-set')
        const menu = requests.at(-1)?.args[0] ?? []
        settings = flatten(menu).find((item) => item.label?.startsWith('Settings'))
        return Boolean(settings)
      })
      .toBe(true)
    await call('desktop:menu-click', [settings.id], 'send')
    expect(events).toContainEqual(expect.objectContaining({ channel: 'ui:openSettings' }))
  })

  it('does not advertise or dispatch embedded browser capabilities', async () => {
    const status = await call('runtime:getStatus')
    expect(status.capabilities.filter((capability) => capability.startsWith('browser.'))).toEqual(
      []
    )
    const result = await call('runtime:call', [
      {
        id: 'browser-disabled',
        method: 'browser.tabCreate',
        params: { worktree: 'folder:notes', url: 'https://example.com' }
      }
    ])
    expect(result).toMatchObject({ error: { code: 'method_not_found' } })
  })

  it.skipIf(process.platform !== 'darwin')(
    'routes notifications through native permission, delivery, click and dismissal',
    async () => {
      nativeResponses.set('notification-authorization', 'authorized')
      nativeResponses.set('notification-show', null)
      nativeResponses.set('notification-dismiss', null)
      nativeResponses.set('notification-settings', null)
      await call('settings:set', [
        {
          notifications: {
            enabled: true,
            agentTaskComplete: true,
            terminalBell: true,
            suppressWhenFocused: true,
            customSoundId: 'system'
          }
        }
      ])
      expect(await call('notifications:probeDelivery')).toEqual({
        state: 'delivered',
        authoritative: true
      })
      const paneKey = 'tab-notify:10000000-0000-4000-8000-000000000001'
      const args = {
        source: 'test',
        notificationId: 'request-1',
        worktreeId: 'folder:notes',
        paneKey,
        requireDisplayConfirmation: true
      }
      expect(await call('notifications:dispatch', [args])).toEqual({ delivered: true })
      const native = nativeRequests.findLast((frame) => frame.channel === 'notification-show')
      expect(native.args[0]).toMatchObject({ title: 'Orca notifications are on', sound: 'default' })
      await call('desktop:notification', [native.args[0].id, 'click'], 'send')
      expect(events).toContainEqual(
        expect.objectContaining({
          channel: 'ui:focusTerminal',
          args: [
            expect.objectContaining({
              worktreeId: 'folder:notes',
              tabId: 'tab-notify',
              leafId: '10000000-0000-4000-8000-000000000001'
            })
          ]
        })
      )
      await call('notifications:dispatch', [{ ...args, notificationId: 'request-2' }])
      expect(await call('notifications:dismiss', [['request-2']])).toEqual({ dismissed: 1 })
      nativeResponses.set('notification-authorization', 'denied')
      expect(await call('notifications:dispatch', [args])).toEqual({
        delivered: false,
        reason: 'blocked-by-system'
      })
      expect(await call('notifications:probeDelivery')).toEqual({
        state: 'blocked',
        authoritative: true
      })
      await call('notifications:openSystemSettings')
      await expect
        .poll(() => nativeRequests.some((frame) => frame.channel === 'notification-settings'))
        .toBe(true)
    }
  )

  it.skipIf(process.platform !== 'darwin')(
    'preserves notification focus suppression, source settings, cooldown and sound assets',
    async () => {
      nativeResponses.set('notification-authorization', 'authorized')
      nativeResponses.set('notification-show', null)
      nativeResponses.set('notification-dismiss', null)
      await call('settings:set', [
        {
          notifications: {
            enabled: true,
            agentTaskComplete: true,
            terminalBell: false,
            suppressWhenFocused: true,
            customSoundId: 'ding'
          }
        }
      ])
      await call(
        'desktop:window-state',
        [{ focused: true, visible: true, minimized: false }],
        'send'
      )
      const args = {
        source: 'agent-task-complete',
        worktreeId: 'repo::/notes',
        isActiveWorktree: true
      }
      expect(await call('notifications:dispatch', [args])).toEqual({
        delivered: false,
        reason: 'suppressed-focus'
      })
      expect(await call('notifications:dispatch', [{ ...args, source: 'terminal-bell' }])).toEqual({
        delivered: false,
        reason: 'source-disabled'
      })
      expect(await call('notifications:dispatch', [{ ...args, isActiveWorktree: false }])).toEqual({
        delivered: true
      })
      expect(await call('notifications:dispatch', [{ ...args, isActiveWorktree: false }])).toEqual({
        delivered: false,
        reason: 'cooldown'
      })
      const sound = await call('notifications:resolveSoundPath')
      expect(sound.ok).toBe(true)
      expect((await readFile(sound.path)).length).toBeGreaterThan(0)
      expect((await call('notifications:loadSound')).ok).toBe(true)
    }
  )
})
