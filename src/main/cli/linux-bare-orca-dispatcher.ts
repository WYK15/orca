import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildAppImageCliWrapper, quoteShell } from './appimage-cli-wrapper'
import { getBundledLauncherPath } from './cli-installer'

// Why: marks a dispatcher this function wrote so repeat serve starts overwrite
// our own file idempotently but never clobber a user's own ~/.local/bin/orca.
export type LinuxBareOrcaDispatcherOptions = {
  /** Packaged app resources root; the bundled `orca-ide` launcher lives under it. */
  resourcesPath: string
  /** Test seam — defaults to the real home directory. */
  homePath?: string
  /** Test seam — defaults to $APPIMAGE (set only when running from an AppImage). */
  appImagePath?: string | null
}

export type LinuxBareOrcaDispatcherState =
  | 'skipped-fork-isolation'
  | 'skipped-foreign'
  | 'skipped-launcher-missing'

export type LinuxBareOrcaDispatcherResult = {
  state: LinuxBareOrcaDispatcherState
  dispatcherPath: string
  /** What the dispatcher execs: the stable AppImage, or the bundled orca-ide. */
  target: string | null
}

// Why: on Linux the CLI installs as `orca-ide`, not bare `orca`, to avoid
// shadowing GNOME Orca's /usr/bin/orca. But the Claude Team launcher typed into
// the initial managed terminal invokes the literal `orca claude-teams`, so a
// headless serve box needs a bare-`orca` dispatcher on the managed-terminal PATH
// (~/.local/bin, which patchPackagedProcessPath puts ahead of /usr/bin). It is a
// plain file, not a managed symlink, so CliInstaller.removeLegacyLinuxCommandIfManaged
// never reclaims it.
export async function installLinuxBareOrcaDispatcher(
  options: LinuxBareOrcaDispatcherOptions
): Promise<LinuxBareOrcaDispatcherResult> {
  const dispatcherPath = join(options.homePath ?? homedir(), '.local', 'bin', 'orca')
  return { state: 'skipped-fork-isolation', dispatcherPath, target: null }
}

/** Managed-terminal `orcaw` shim that execs the stable AppImage or `orcaw-ide`. */
export function buildBareOrcaCliScript(
  resourcesPath: string,
  appImagePath: string | null
): { script: string; target: string } | null {
  if (appImagePath) {
    // Why: an AppImage mounts resources under an ephemeral FUSE path per launch,
    // so the script must exec the stable outer AppImage — reuse the same
    // wrapper CliInstaller installs for the AppImage command.
    return { script: buildAppImageCliWrapper(appImagePath), target: appImagePath }
  }

  const launcher = getBundledLauncherPath('linux', resourcesPath)
  // Why: getBundledLauncherPath only joins the path; guard existence so we never
  // write a script pointing at a missing launcher (which would fail at exec
  // time with a confusing error instead of the command-not-found we fix).
  if (!launcher || !existsSync(launcher)) {
    return null
  }
  return {
    script: `#!/usr/bin/env bash\nexec ${quoteShell(launcher)} "$@"\n`,
    target: launcher
  }
}
