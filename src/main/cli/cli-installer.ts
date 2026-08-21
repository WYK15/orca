import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CliInstallStatus } from '../../shared/cli-install-types'
import { getBundledLauncherPath, LINUX_CLI_COMMAND_NAME } from './bundled-cli-launcher-path'
import { DEV_COMMAND_NAME, NATIVE_COMMAND_NAME } from './cli-install-constants'
import type { CliInstallerOptions } from './cli-installer-contracts'
import { CliPathRegistration } from './cli-path-registration'

const DEFAULT_ORCAW_MAC_COMMAND_PATH = '/usr/local/bin/orcaw'
export class CliInstaller extends CliPathRegistration {
  protected override get commandName(): string {
    if (!this.isPackaged && !this.commandPathOverride) {
      return DEV_COMMAND_NAME
    }
    return this.platform === 'linux' ? LINUX_CLI_COMMAND_NAME : NATIVE_COMMAND_NAME
  }

  constructor(options: CliInstallerOptions = {}) {
    super({
      ...options,
      defaultMacCommandPath: options.defaultMacCommandPath ?? DEFAULT_ORCAW_MAC_COMMAND_PATH
    })
  }

  protected override resolveCommandPath(): string | null {
    const commandPath = super.resolveCommandPath()
    if (this.platform !== 'darwin' || !this.isPackaged || this.commandPathOverride) {
      return commandPath
    }
    return this.macCommandPath.endsWith(`/${NATIVE_COMMAND_NAME}`)
      ? commandPath
      : join(this.homePath, '.local', 'bin', NATIVE_COMMAND_NAME)
  }
  async getStatus(): Promise<CliInstallStatus> {
    const defaultSpec = this.resolveInstallSpec()
    if (!defaultSpec) {
      return {
        platform: this.platform,
        commandName: this.commandName,
        commandPath: null,
        pathDirectory: null,
        pathConfigured: false,
        launcherPath: null,
        installMethod: null,
        supported: false,
        state: 'unsupported',
        currentTarget: null,
        unsupportedReason: 'platform_not_supported',
        detail: 'CLI registration is not implemented on this platform.'
      }
    }

    const launcherPath = await this.resolveLauncherPath()
    if (!launcherPath) {
      const detail =
        this.isLinuxAppImage() && this.appImagePath
          ? `The AppImage file at ${this.appImagePath} is missing. Move it back or re-run CLI registration from the current AppImage location.`
          : this.isPackaged
            ? 'The bundled CLI launcher is missing from this Orca build.'
            : 'Development mode uses a generated launcher for validation only.'
      return {
        platform: this.platform,
        commandName: this.commandName,
        commandPath: defaultSpec.commandPath,
        pathDirectory: dirname(defaultSpec.commandPath),
        pathConfigured: false,
        launcherPath: null,
        installMethod: defaultSpec.installMethod,
        supported: false,
        state: 'unsupported',
        currentTarget: null,
        unsupportedReason: this.isPackaged ? 'launcher_missing' : 'launch_mode_unavailable',
        detail
      }
    }

    const spec = await this.resolveActiveInstallSpec(defaultSpec, launcherPath)
    const baseStatus =
      spec.installMethod === 'symlink'
        ? await this.inspectSymlink(spec.commandPath, launcherPath)
        : this.isLinuxAppImage()
          ? await this.inspectAppImageWrapper(spec.commandPath, launcherPath)
          : await this.inspectWindowsWrapper(spec.commandPath, launcherPath)
    const pathDirectory = dirname(spec.commandPath)
    const pathProbe = await this.probePathConfiguration(pathDirectory)
    return this.withPathInfo(baseStatus, pathDirectory, pathProbe)
  }

  async install(): Promise<CliInstallStatus> {
    const status = await this.getStatus()
    if (!status.supported || !status.commandPath || !status.launcherPath || !status.installMethod) {
      throw new Error(status.detail ?? 'CLI registration is unavailable on this build.')
    }
    if (status.state === 'conflict') {
      throw new Error(`Refusing to replace non-Orcaw command at ${status.commandPath}.`)
    }

    // eslint-disable-next-line unicorn/prefer-ternary -- Why: the install path performs async side effects and is easier to audit as an explicit branch than as an awaited ternary.
    if (status.installMethod === 'symlink') {
      await this.installSymlink(status)
    } else if (this.isLinuxAppImage()) {
      await this.installAppImageWrapper(status.commandPath, status.launcherPath)
    } else if (this.isWindowsPackagedBundledCommand(status.commandPath, status.launcherPath)) {
      // Why: packaged Windows already ships resources/bin/orcaw.exe; registration only owns the PATH entry.
    } else {
      // Why: the Windows wrapper dir is user-writable (%LOCALAPPDATA%), so mkdir here can't hit EACCES.
      await mkdir(dirname(status.commandPath), { recursive: true })
      await this.installWindowsWrapper(status.commandPath, status.launcherPath)
    }

    if (this.platform === 'win32') {
      // Why: Windows shells find commands via user PATH, so the installer owns that entry, not the desktop installer.
      await this.ensureWindowsPathEntry(dirname(status.commandPath))
    }

    return this.getStatus()
  }

  async remove(): Promise<CliInstallStatus> {
    const status = await this.getStatus()
    if (!status.supported || !status.commandPath || !status.launcherPath || !status.installMethod) {
      return status
    }
    if (status.state === 'not_installed') {
      if (this.platform === 'win32') {
        await this.removeWindowsPathEntry(dirname(status.commandPath))
        return this.getStatus()
      }
      return status
    }
    if (status.state === 'conflict') {
      throw new Error(`Refusing to remove non-Orcaw command at ${status.commandPath}.`)
    }
    if (status.state === 'stale') {
      throw new Error(`Refusing to remove a command not owned by Orcaw at ${status.commandPath}.`)
    }

    if (status.installMethod === 'symlink') {
      await this.removeSymlink(status.commandPath)
    } else if (this.isWindowsPackagedBundledCommand(status.commandPath, status.launcherPath)) {
      await this.removeWindowsPathEntry(dirname(status.commandPath))
    } else {
      await unlink(status.commandPath)
      await this.removeWindowsPathEntry(dirname(status.commandPath))
    }

    return this.getStatus()
  }
}

export { getBundledLauncherPath }
