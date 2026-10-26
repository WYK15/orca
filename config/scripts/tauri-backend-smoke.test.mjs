import { registerTauriMarkdownImageReadTest } from './tauri-markdown-image-read-cases.mjs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn, execFile } from 'node:child_process'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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
let nativeRequests = []
let nativeResponses = new Map()

async function startHost(overrides = {}) {
  const env = {
    ...process.env,
    ORCA_TAURI_USER_DATA: join(directory, 'data'),
    ORCA_TAURI_APP_ROOT: join(root, 'out/tauri-backend'),
    ORCA_TAURI_RESOURCES: join(root, 'out/tauri-resources')
  }
  delete env.VITEST
  delete env.ORCA_TAURI_ORCAW_DATA
  Object.assign(env, overrides)
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

  it('saves standalone HTML and routes printing through the native port', async () => {
    const filePath = join(directory, 'export.html')
    const payload = { html: '<!doctype html><p>原文 -> &gt;</p>', title: 'Report' }
    nativeResponses.set('save-dialog', filePath)
    expect(await call('export:html-to-file', [payload])).toEqual({ success: true, filePath })
    expect(await readFile(filePath, 'utf8')).toBe(payload.html)
    expect(nativeRequests.findLast((frame) => frame.channel === 'save-dialog').args).toEqual([
      { defaultPath: 'Report.html', filters: [{ name: 'HTML', extensions: ['html'] }] }
    ])
    nativeResponses.set('save-dialog', null)
    expect(await call('export:html-to-file', [payload])).toEqual({
      success: false,
      cancelled: true
    })
    nativeResponses.set('print-html', { opened: true })
    await call('export:print-html', [payload])
    expect(nativeRequests.findLast((frame) => frame.channel === 'print-html').args).toEqual([
      payload
    ])
    await expect(call('export:print-html', [{ html: '', title: 'Invalid' }])).rejects.toThrow(
      'Invalid export'
    )
  })

  registerTauriMarkdownImageReadTest(() => ({ call, project, directory }))

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

  it('omits remote hosts and rejects connections and orchestration while retaining local runtime calls', async () => {
    expect(await call('ssh:listTargets')).toEqual([])
    await expect(
      call('ssh:addTarget', [
        { target: { label: 'Fixture', host: 'example.invalid', port: 22, username: 'tester' } }
      ])
    ).rejects.toThrow()
    expect(await call('runtimeEnvironments:list')).toEqual([])
    await expect(call('ssh:connect', [{ targetId: 'old-target' }])).rejects.toThrow()
    await expect(
      call('runtimeEnvironments:connect', [{ selector: 'old-server' }])
    ).rejects.toThrow()
    for (const method of [
      'ssh.connect',
      'orchestration.runList',
      'nativeChat.readSession',
      'pairing.getEndpoints'
    ]) {
      expect(await call('runtime:call', [{ method, params: {} }])).toMatchObject({
        error: { code: 'method_not_found' }
      })
    }
    const status = await call('runtime:getStatus')
    expect(
      status.capabilities.some(
        (capability) =>
          capability.startsWith('orchestration.') || capability === 'runtime.environments.v1'
      )
    ).toBe(false)
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

  it('omits the Orca plugin worker and leaves removed integrations disconnected', async () => {
    expect(await call('plugins:list')).toEqual([])
    expect(await call('plugins:listLanguagePacks')).toEqual([])
    expect(await call('linear:status')).toEqual({ connected: false, viewer: null })
    expect(await call('jira:status')).toEqual({ connected: false, viewer: null })
    await expect(
      readFile(join(root, 'out/tauri-backend/plugin-host-entry.js'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(call('plugins:install', [{}])).rejects.toThrow()
    await expect(call('automations:list')).rejects.toThrow()
  })

  it('persists appearance and project organization across restart while retaining the folder catalog', async () => {
    const { repo } = await call('repos:add', [{ path: project, kind: 'folder' }])
    const preferences = {
      desktopAppearance: { iconSize: 24, textSize: 16, density: 'spacious' },
      sidebarProjectArchive: { [repo.id]: 123 },
      sidebarPinnedRepoIds: [repo.id]
    }
    await call('settings:set', [preferences])
    await stopHost()
    await startHost()
    expect(await call('settings:get')).toMatchObject(preferences)
    expect(await call('repos:list')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: repo.id, path: project, kind: 'folder' })
      ])
    )
  })

  it('keeps experimental features and remote routing disabled after settings updates and restart', async () => {
    const disabled = {
      experimentalPet: false,
      experimentalActivity: false,
      experimentalAgentDashboardPopout: false,
      experimentalAgentHibernation: false,
      experimentalNativeChat: false,
      experimentalEphemeralVms: false,
      experimentalNewWorktreeCardStyle: false,
      openAgentTabsInChatByDefault: false,
      activeRuntimeEnvironmentId: null
    }
    await call('settings:set', [
      {
        ...Object.fromEntries(Object.keys(disabled).map((key) => [key, true])),
        activeRuntimeEnvironmentId: 'legacy-server'
      }
    ])
    expect(await call('settings:get')).toMatchObject(disabled)
    await stopHost()
    await startHost()
    expect(await call('settings:get')).toMatchObject(disabled)
  })

  it('keeps legacy remote records on disk while exposing only local projects', async () => {
    const { repo } = await call('repos:add', [{ path: project, kind: 'folder' }])
    await stopHost()
    const file = join(directory, 'data/orca-data.json')
    const snapshot = JSON.parse(await readFile(file, 'utf8'))
    snapshot.repos.push({
      ...repo,
      id: 'legacy-ssh',
      connectionId: 'old-host',
      executionHostId: 'ssh:old-host'
    })
    snapshot.settings.experimentalPet = true
    snapshot.settings.activeRuntimeEnvironmentId = 'old-server'
    await writeFile(file, JSON.stringify(snapshot))
    await startHost()
    expect((await call('repos:list')).map((item) => item.id)).toEqual([repo.id])
    expect(await call('settings:get')).toMatchObject({
      experimentalPet: false,
      activeRuntimeEnvironmentId: null
    })
    await call('desktop:flush')
    const retained = JSON.parse(await readFile(file, 'utf8'))
    expect(retained.repos.some((item) => item.id === 'legacy-ssh')).toBe(true)
    expect(retained.settings.experimentalPet).toBe(true)
    expect(retained.settings.activeRuntimeEnvironmentId).toBe('old-server')
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

  it('imports saved Orcaw projects/settings before starting services and preserves the Tauri project', async () => {
    await call('repos:add', [{ path: project, kind: 'folder' }])
    await stopHost()
    const before = JSON.parse(await readFile(join(directory, 'data/orca-data.json'), 'utf8'))
    const source = join(directory, 'legacy-Orcaw')
    const importedPath = join(directory, 'imported-project')
    await mkdir(source)
    await mkdir(importedPath)
    const legacy = structuredClone(before)
    legacy.repos = [
      { ...before.repos[0], id: 'source-repo', path: importedPath, displayName: 'Imported Orcaw' }
    ]
    legacy.projects = before.projects.map((row) => ({
      ...row,
      id: 'source-project',
      sourceRepoIds: ['source-repo']
    }))
    legacy.projectHostSetups = before.projectHostSetups.map((row) => ({
      ...row,
      id: 'source-setup',
      repoId: 'source-repo',
      projectId: 'source-project',
      path: importedPath
    }))
    legacy.settings.terminalFontSize = 19
    legacy.settings.opencodeSessionCookie = 'must-not-copy-electron-ciphertext'
    legacy.sshPtyConsumerRecoveries = [{ ownerLease: 'must-not-recover-electron-pty' }]
    const original = JSON.stringify(legacy)
    await writeFile(join(source, 'orca-data.json'), original)
    nativeResponses.set('profile-import-confirm', true)
    await startHost({ ORCA_TAURI_ORCAW_DATA: source })
    expect((await call('repos:list')).map((repo) => repo.path).sort()).toEqual(
      [project, importedPath].sort()
    )
    expect((await call('settings:get')).terminalFontSize).toBe(19)
    expect((await call('settings:get')).opencodeSessionCookie).not.toBe(
      'must-not-copy-electron-ciphertext'
    )
    expect(await readFile(join(source, 'orca-data.json'), 'utf8')).toBe(original)
    const imported = JSON.parse(await readFile(join(directory, 'data/orca-data.json'), 'utf8'))
    expect(imported.sshPtyConsumerRecoveries).toEqual(before.sshPtyConsumerRecoveries)
    expect(nativeRequests.some((request) => request.channel === 'profile-import-confirm')).toBe(
      true
    )
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
