import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'
import { runProcessSync } from '../../shared/child-process/run-process'
import { getManagedWslCliDir, getWslCliCommandName } from './wsl-managed-cli'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'orca-managed-wsl-'))
  roots.push(root)
  const resourcesPath = join(root, 'resources with spaces')
  mkdirSync(join(resourcesPath, 'bin'), { recursive: true })
  writeFileSync(join(resourcesPath, 'bin', 'orcaw.exe'), 'fixture')
  return { isPackaged: true, resourcesPath, userDataPath: join(root, 'user data') }
}

describe('managed WSL CLI provisioning', () => {
  it('keeps the packaged Orcaw and development command identities separate', () => {
    expect(getWslCliCommandName(true)).toBe('orcaw-ide')
    expect(getWslCliCommandName(false)).toBe('orca-dev')
  })

  it.skipIf(process.platform === 'win32')(
    'resolves the colocated Orcaw bridge and forwards cwd, distro and argv independently of PowerShell PATH',
    () => {
      const host = fixture()
      const directory = getManagedWslCliDir(host)
      expect(directory).not.toBeNull()
      const tools = join(host.resourcesPath, "tools with 'quotes'")
      mkdirSync(tools)
      const powershell = join(tools, 'captured-powershell')
      writeFileSync(powershell, '#!/bin/sh\nprintf "%s\\0" "$@"\n', { mode: 0o700 })
      writeFileSync(
        join(tools, 'wslpath'),
        '#!/bin/sh\nif [ "$1" = -u ]; then printf "%s" "$ORCA_TEST_POWERSHELL"; else printf "%s" "$2"; fi\n',
        { mode: 0o700 }
      )
      const args = ['two words', 'literal $HOME', "a'b", '', 'C:\\trailing\\']
      const result = runProcessSync({
        program: '/bin/bash',
        args: [join(directory!, 'orcaw-ide'), ...args],
        cwd: tools,
        env: {
          ...process.env,
          PATH: `${tools}:/usr/bin:/bin`,
          ORCA_TEST_POWERSHELL: powershell,
          WSL_DISTRO_NAME: 'Ubuntu Work'
        }
      })
      expect(result.code, result.stderr).toBe(0)
      expect(result.stdout.split('\0').slice(0, -1)).toEqual([
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(directory!, 'orcaw-wsl-bridge.ps1'),
        join(host.resourcesPath, 'bin', 'orcaw.exe'),
        '-WslCwd',
        realpathSync(tools),
        '-WslDistro',
        'Ubuntu Work',
        ...args
      ])
    }
  )

  it('reuses a complete tree, repairs missing files, and isolates app identities and updates', () => {
    const host = fixture()
    const directory = getManagedWslCliDir(host)
    expect(directory).not.toBeNull()
    const launcher = join(directory!, 'orcaw-ide')
    const bridge = join(directory!, 'orcaw-wsl-bridge.ps1')
    expect(existsSync(join(directory!, 'orca-ide'))).toBe(false)
    expect(existsSync(join(directory!, 'orca-wsl-bridge.ps1'))).toBe(false)
    expect(readFileSync(launcher, 'utf8')).toContain('/orcaw-wsl-bridge.ps1')
    expect(readFileSync(bridge, 'utf8')).toContain('# Orcaw managed WSL CLI PowerShell bridge')
    const modified = statSync(launcher).mtimeMs
    expect(getManagedWslCliDir(host)).toBe(directory)
    expect(statSync(launcher).mtimeMs).toBe(modified)
    rmSync(launcher)
    expect(getManagedWslCliDir(host)).toBe(directory)
    expect(readFileSync(launcher, 'utf8')).toContain('resources with spaces')
    expect(readFileSync(launcher, 'utf8')).toContain('orcaw.exe')
    rmSync(bridge)
    expect(getManagedWslCliDir(host)).toBe(directory)
    expect(readFileSync(bridge, 'utf8')).toContain(host.userDataPath)
    const second = { ...host, userDataPath: join(host.userDataPath, 'second') }
    expect(getManagedWslCliDir(second)).not.toBe(directory)
    const update = fixture()
    expect(getManagedWslCliDir({ ...update, userDataPath: host.userDataPath })).not.toBe(directory)
  })

  it('provides nothing when the packaged CLI runtime is missing', () => {
    const host = fixture()
    rmSync(join(host.resourcesPath, 'bin', 'orcaw.exe'))
    // An upstream runtime is not a fallback for Orcaw.
    writeFileSync(join(host.resourcesPath, 'bin', 'orca.exe'), 'upstream fixture')
    expect(getManagedWslCliDir(host)).toBeNull()
  })

  it('provides nothing when user data cannot hold the CLI', () => {
    const host = fixture()
    writeFileSync(host.userDataPath, 'a file, not a directory')
    expect(getManagedWslCliDir(host)).toBeNull()
  })

  it('runs the development CLI directly with the dev launcher env', () => {
    const host = fixture()
    const appPath = host.resourcesPath
    const cliEntryPath = join(appPath, 'out', 'cli', 'index.js')
    mkdirSync(join(appPath, 'out', 'cli'), { recursive: true })
    writeFileSync(cliEntryPath, 'fixture')
    installFakeAppEnvironment({ getPath: () => host.userDataPath, getAppPath: () => appPath })
    const directory = getManagedWslCliDir({ ...host, isPackaged: false }) ?? ''
    expect(readFileSync(join(directory, 'orca-dev'), 'utf8')).toContain(process.execPath)
    const bridge = readFileSync(join(directory, 'orcaw-wsl-bridge.ps1'), 'utf8')
    expect(bridge.startsWith('\uFEFF')).toBe(true)
    expect(bridge).toContain(host.userDataPath)
    expect(bridge).toContain(cliEntryPath)
    expect(bridge).toContain('$env:ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT')
    expect(bridge).toContain('Remove-Item Env:NODE_OPTIONS')
  })
})
