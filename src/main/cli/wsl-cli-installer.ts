import type { CliInstallStatus } from '../../shared/cli-install-types'
import { getDefaultWslDistro } from '../wsl'
import { runWslProcess } from '../wsl/wsl-runner'
import { CliInstaller } from './cli-installer'
import {
  buildRegistrationLockPrelude,
  buildSafeRemoveCommand,
  buildSafeReplaceGuard,
  buildWslBridgeScript,
  buildWslLauncher,
  getBridgePathFromCommandPath,
  getPosixDirname,
  getWslBridgeMarker,
  getWslLauncherMarker,
  parseManagedLauncherTarget,
  quoteShell
} from './wsl-cli-scripts'
import { buildWslCliStatus, readWslCliCommandFile, resolveReadyWslCliState } from './wsl-cli-status'

const MANAGED_MARKER = getWslLauncherMarker()
const BRIDGE_MANAGED_MARKER = getWslBridgeMarker()
const WSL_COMMAND_NAME = 'orcaw-ide'
const WSL_COMMAND_TIMEOUT_MS = 10_000

function normalizeManagedScriptContent(content: string): string {
  return content.replace(/\n+$/u, '\n')
}

function managedScriptMatches(content: string, expected: string, managed: boolean): boolean {
  return content === expected || (managed && normalizeManagedScriptContent(content) === expected)
}

type WslCliInstallerOptions = {
  platform?: NodeJS.Platform
  distro?: string | null
  hostInstaller?: Pick<CliInstaller, 'getStatus'>
  wslRunner?: (distro: string, command: string) => Promise<string>
}

export type ManagedWslCliRepairResult = {
  changed: boolean
  managed: boolean
  status: CliInstallStatus
}

export class WslCliInstaller {
  private readonly platform: NodeJS.Platform
  private readonly distro: string | null
  private readonly hostInstaller: Pick<CliInstaller, 'getStatus'>
  private readonly wslRunner: (distro: string, command: string) => Promise<string>

  constructor(options: WslCliInstallerOptions = {}) {
    this.platform = options.platform ?? process.platform
    this.distro = options.distro === undefined ? getDefaultWslDistro() : options.distro
    this.hostInstaller = options.hostInstaller ?? new CliInstaller()
    this.wslRunner = options.wslRunner ?? runWslCommand
  }

  async getStatus(): Promise<CliInstallStatus> {
    const readyState = await resolveReadyWslCliState({
      platform: this.platform,
      distro: this.distro,
      getHostStatus: () => this.hostInstaller.getStatus(),
      run: (distro, command) => this.run(distro, command)
    })
    if ('status' in readyState) {
      return { ...readyState.status, commandName: WSL_COMMAND_NAME }
    }
    const ready = {
      ...readyState,
      commandPath: readyState.commandPath.replace(/orca-ide$/, WSL_COMMAND_NAME),
      bridgePath: getBridgePathFromCommandPath(
        readyState.commandPath.replace(/orca-ide$/, WSL_COMMAND_NAME)
      )
    }

    const content = await this.readCommandFile(ready.distro, ready.commandPath)
    if (content === null) {
      return this.buildStatus({
        distro: ready.distro,
        commandPath: ready.commandPath,
        launcherPath: ready.launcherPath,
        state: 'not_installed',
        currentTarget: null,
        pathConfigured: ready.pathConfigured,
        detail: `Register ${ready.commandPath} to use Orcaw from WSL.`
      })
    }

    if (content === 'not_file') {
      return this.buildStatus({
        distro: ready.distro,
        commandPath: ready.commandPath,
        launcherPath: ready.launcherPath,
        state: 'conflict',
        currentTarget: null,
        pathConfigured: ready.pathConfigured,
        detail: `${ready.commandPath} exists but is not an Orcaw launcher script.`
      })
    }

    const expected = buildWslLauncher(ready.launcherPath, ready.bridgePath)
    const managed = content.includes(MANAGED_MARKER)
    const currentTarget = managed ? parseManagedLauncherTarget(content) : null
    if (managedScriptMatches(content, expected, managed)) {
      const bridgeContent = await this.readCommandFile(ready.distro, ready.bridgePath)
      const expectedBridge = buildWslBridgeScript()
      const bridgeManaged =
        typeof bridgeContent === 'string' && bridgeContent.includes(BRIDGE_MANAGED_MARKER)
      if (
        typeof bridgeContent === 'string' &&
        managedScriptMatches(bridgeContent, expectedBridge, bridgeManaged)
      ) {
        return this.buildStatus({
          distro: ready.distro,
          commandPath: ready.commandPath,
          launcherPath: ready.launcherPath,
          state: 'installed',
          currentTarget,
          pathConfigured: ready.pathConfigured,
          detail: `Registered in ${ready.distro} at ${ready.commandPath}.`
        })
      }

      return this.buildStatus({
        distro: ready.distro,
        commandPath: ready.commandPath,
        launcherPath: ready.launcherPath,
        state: bridgeContent === null || bridgeManaged ? 'stale' : 'conflict',
        currentTarget,
        pathConfigured: ready.pathConfigured,
        detail:
          bridgeContent === null || bridgeManaged
            ? `${ready.commandPath} is missing its PowerShell bridge.`
            : `${ready.bridgePath} exists but is not managed by Orcaw.`
      })
    }

    // Why: a stale managed launcher is only repairable when its bridge is
    // ours too; reporting conflict here keeps repair from a doomed install
    // whose bridge guard would fail on every startup.
    const bridgeConflict = managed && (await this.isBridgeConflict(ready.distro, ready.bridgePath))
    return this.buildStatus({
      distro: ready.distro,
      commandPath: ready.commandPath,
      launcherPath: ready.launcherPath,
      state: managed && !bridgeConflict ? 'stale' : 'conflict',
      currentTarget,
      pathConfigured: ready.pathConfigured,
      detail: !managed
        ? `${ready.commandPath} exists but is not managed by Orcaw.`
        : bridgeConflict
          ? `${ready.bridgePath} exists but is not managed by Orcaw.`
          : `${ready.commandPath} points to a different Orcaw launcher.`
    })
  }

  private async isBridgeConflict(distro: string, bridgePath: string): Promise<boolean> {
    const bridgeContent = await this.readCommandFile(distro, bridgePath)
    if (bridgeContent === null) {
      return false
    }
    return bridgeContent === 'not_file' || !bridgeContent.includes(BRIDGE_MANAGED_MARKER)
  }

  async repairManagedRegistration(): Promise<ManagedWslCliRepairResult> {
    const status = await this.getStatus()
    if (!status.supported) {
      return { changed: false, managed: false, status }
    }
    if (status.state === 'conflict') {
      // Why: a user-owned bridge conflicts with repair, but the launcher is
      // still Orca-managed and must remain registered for future reconciliation.
      return { changed: false, managed: status.currentTarget !== null, status }
    }

    if (status.state === 'stale') {
      return { changed: true, managed: true, status: await this.install(status) }
    }

    return { changed: false, managed: status.state === 'installed', status }
  }

  async install(precomputedStatus?: CliInstallStatus): Promise<CliInstallStatus> {
    // Why: repair passes its fresh probe; re-probing here would double every
    // WSL round trip on the startup reconciliation path.
    const status = precomputedStatus ?? (await this.getStatus())
    if (!status.supported || !status.commandPath || !status.launcherPath) {
      throw new Error(status.detail ?? 'WSL CLI registration is unavailable.')
    }
    if (status.state === 'conflict') {
      throw new Error(`Refusing to replace non-Orcaw command at ${status.commandPath}.`)
    }

    await this.run(
      this.distro as string,
      buildForkWslCliInstallCommand(status)
    )
    return this.getStatus()
  }

  async remove(): Promise<CliInstallStatus> {
    const status = await this.getStatus()
    if (!status.supported || !status.commandPath) {
      return status
    }
    if (status.state === 'not_installed') {
      return status
    }
    if (status.state === 'conflict') {
      throw new Error(`Refusing to remove non-Orcaw command at ${status.commandPath}.`)
    }

    await this.run(this.distro as string, buildSafeRemoveCommand(status.commandPath))
    return this.getStatus()
  }

  private async readCommandFile(
    distro: string,
    commandPath: string
  ): Promise<(string & {}) | 'not_file' | null> {
    return readWslCliCommandFile(
      (targetDistro, command) => this.run(targetDistro, command),
      distro,
      commandPath
    )
  }

  private buildStatus(args: {
    distro: string
    commandPath: string
    launcherPath: string
    state: CliInstallStatus['state']
    currentTarget: string | null
    pathConfigured: boolean
    detail: string
  }): CliInstallStatus {
    return { ...buildWslCliStatus(args), commandName: WSL_COMMAND_NAME }
  }

  private async run(distro: string, command: string): Promise<string> {
    return this.wslRunner(distro, command)
  }
}

function buildForkWslCliInstallCommand(
  status: CliInstallStatus & { commandPath: string; launcherPath: string }
): string {
  const bridgePath = getBridgePathFromCommandPath(status.commandPath)
  return [
    'set -eu',
    `mkdir -p ${quoteShell(status.pathDirectory as string)}`,
    `mkdir -p ${quoteShell(getPosixDirname(bridgePath))}`,
    buildRegistrationLockPrelude(status.commandPath),
    `command_tmp=${quoteShell(`${status.commandPath}.tmp`)}.$$`,
    `bridge_path=${quoteShell(bridgePath)}`,
    'bridge_tmp="${bridge_path}.tmp.$$"',
    'bridge_backup="${bridge_tmp}.backup"',
    'bridge_had_original=0',
    'bridge_touched=0',
    'committed=0',
    'rollback() {',
    '  result=$?',
    '  set +e',
    '  if [ "$committed" -ne 1 ]; then',
    `    if [ "$bridge_had_original" -eq 1 ]; then mv -f "$bridge_backup" ${quoteShell(bridgePath)}; elif [ "$bridge_touched" -eq 1 ]; then rm -f ${quoteShell(bridgePath)}; fi`,
    '  fi',
    '  rm -f "$command_tmp" "$bridge_tmp" "$bridge_backup"',
    '  exit "$result"',
    '}',
    'trap rollback EXIT',
    buildSafeReplaceGuard(status.commandPath, MANAGED_MARKER),
    buildSafeReplaceGuard(bridgePath, BRIDGE_MANAGED_MARKER),
    `cat > "$command_tmp" <<'ORCA_WSL_CLI'`,
    buildWslLauncher(status.launcherPath, bridgePath),
    'ORCA_WSL_CLI',
    `cat > "$bridge_tmp" <<'ORCA_WSL_BRIDGE'`,
    buildWslBridgeScript(),
    'ORCA_WSL_BRIDGE',
    'chmod 755 "$command_tmp"',
    'chmod 644 "$bridge_tmp"',
    buildSafeReplaceGuard(status.commandPath, MANAGED_MARKER),
    buildSafeReplaceGuard(bridgePath, BRIDGE_MANAGED_MARKER),
    `if [ -f ${quoteShell(bridgePath)} ]; then cp -p ${quoteShell(bridgePath)} "$bridge_backup"; bridge_had_original=1; fi`,
    `mv -f "$bridge_tmp" ${quoteShell(bridgePath)}`,
    'bridge_touched=1',
    `mv -f "$command_tmp" ${quoteShell(status.commandPath)}`,
    'committed=1',
    'rm -f "$bridge_backup"',
    'trap - EXIT'
  ].join('\n')
}

async function runWslCommand(distro: string, command: string): Promise<string> {
  // Why the probe lane fixes #14288: the prior login shell (`bash -lc`) sourced
  // ~/.profile, so one blocking line there ate the whole 10s timeout.
  const result = await runWslProcess({
    distro,
    loginPath: 'preferred',
    script: command,
    // Declared, not assumed: the payload is opaque here, so the guard cannot
    // check it for bashisms. These are POSIX (`-eu`, `case`), hence sh.
    shell: 'sh',
    timeoutMs: WSL_COMMAND_TIMEOUT_MS
  })
  // Timeout first: it is the more specific diagnosis, and a timed-out run also
  // leaves the environment unresolved, so the order decides which one shows.
  if (result.timedOut) {
    throw new Error(`WSL command timed out after ${WSL_COMMAND_TIMEOUT_MS}ms.`)
  }
  // Every command here reads the login PATH -- the `case ":$PATH:"` probe most
  // of all. Without it that probe answers from the distro default PATH, which
  // never has ~/.local/bin, and Settings states as fact that the CLI is not on
  // PATH while the user's own terminal finds it. Unverifiable, not negative.
  if (!result.environmentResolved) {
    throw new Error('Could not reach the WSL distro. Try again.')
  }
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `WSL command failed with exit code ${result.code}.`)
  }
  return result.stdout
}

export const _internals = {
  buildWslBridgeScript,
  buildWslLauncher,
  getBridgePathFromCommandPath,
  parseManagedLauncherTarget
}
