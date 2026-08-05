import type * as os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  homedir: vi.fn(),
  installRemote: vi.fn(),
  readHostIdentity: vi.fn(),
  scopeHostIdentity: vi.fn(),
  withInstallLock: vi.fn()
}))

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof os>()),
  homedir: mocks.homedir
}))
vi.mock('./remote-managed-hook-installers', () => ({
  installRemoteManagedAgentHooks: mocks.installRemote
}))
vi.mock('./managed-hook-owner-identity', () => ({
  readManagedHookHostIdentity: mocks.readHostIdentity,
  scopeManagedHookHostIdentity: mocks.scopeHostIdentity
}))
vi.mock('./managed-hook-install-lock', () => ({
  withManagedHookInstallLock: mocks.withInstallLock
}))

import { installManagedHooks, resolveRelayGrokHome } from './managed-hook-runtime'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('managed hook runtime', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns before host probes when no agents are detected', async () => {
    await expect(installManagedHooks({ agents: [] })).resolves.toEqual({
      installers: 0,
      errors: 0
    })

    expect(mocks.homedir).not.toHaveBeenCalled()
    expect(mocks.readHostIdentity).not.toHaveBeenCalled()
    expect(mocks.scopeHostIdentity).not.toHaveBeenCalled()
    expect(mocks.withInstallLock).not.toHaveBeenCalled()
    expect(mocks.installRemote).not.toHaveBeenCalled()
  })
})

describe.runIf(process.platform !== 'win32')('resolveRelayGrokHome', () => {
  it('uses the login-shell GROK_HOME and normalizes trailing separators', async () => {
    vi.stubEnv('SHELL', '/bin/sh')
    vi.stubEnv('GROK_HOME', '/srv/grok///')

    await expect(resolveRelayGrokHome('/home/orca')).resolves.toBe('/srv/grok')
  })

  it('falls back when the login-shell GROK_HOME is not an absolute POSIX path', async () => {
    vi.stubEnv('SHELL', '/bin/sh')
    vi.stubEnv('GROK_HOME', '../relative')

    await expect(resolveRelayGrokHome('/home/orca')).resolves.toBe('/home/orca/.grok')
  })
})
