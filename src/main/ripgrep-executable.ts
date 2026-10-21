import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseWslPath } from './wsl'

export function getRgExecutable(searchPath?: string, wslDistro?: string): string {
  // WSL must run its own Linux executable, never the bundled Windows binary.
  if (wslDistro || (searchPath && parseWslPath(searchPath))) {
    return 'rg'
  }

  const executable = process.platform === 'win32' ? 'rg.exe' : 'rg'
  if (process.resourcesPath) {
    const packaged = join(process.resourcesPath, 'ripgrep', executable)
    if (existsSync(packaged)) {
      return packaged
    }
  }

  try {
    const packageRoot = dirname(dirname(require.resolve('@vscode/ripgrep-universal')))
    const development = join(packageRoot, 'bin', `${process.platform}-${process.arch}`, executable)
    if (existsSync(development)) {
      return development
    }
  } catch {
    // Source-only installs can still use a system rg or the Git fallback.
  }
  return 'rg'
}
