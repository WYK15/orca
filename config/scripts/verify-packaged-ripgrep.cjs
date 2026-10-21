const { existsSync, chmodSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

function verifyPackagedRipgrep(resourcesDir, platform, arch) {
  const executable = join(resourcesDir, 'ripgrep', platform === 'win32' ? 'rg.exe' : 'rg')
  if (!existsSync(executable)) {
    throw new Error(`Missing bundled ripgrep executable: ${executable}`)
  }
  if (platform !== 'win32') {
    chmodSync(executable, 0o755)
  }
  const hostArch = { ia32: 0, x64: 1, armv7l: 2, arm64: 3 }[process.arch]
  if (platform === process.platform && arch === hostArch) {
    const version = execFileSync(executable, ['--version'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
      timeout: 5000
    })
    if (!version.startsWith('ripgrep ')) {
      throw new Error(`Invalid bundled ripgrep executable: ${executable}`)
    }
  }
}

module.exports = { verifyPackagedRipgrep }
