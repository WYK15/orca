import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, delimiter } from 'node:path'
import { homedir } from 'node:os'
import { mkdtemp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
if (process.platform === 'linux' && args[0] === 'build' && !args.includes('--no-bundle')) {
  throw new Error(
    'Linux Tauri installers are disabled until WebKitGTK 4.1 is validated on Ubuntu 20.04. Use --no-bundle for development; Electron Linux releases retain the glibc 2.31 baseline.'
  )
}
const entry = join(dirname(require.resolve('@tauri-apps/cli/package.json')), 'tauri.js')
const child = spawn(process.execPath, [entry, ...args], {
  stdio: 'inherit',
  env: { ...process.env, PATH: [join(homedir(), '.cargo/bin'), process.env.PATH].join(delimiter) }
})
child.on('exit', async (code) => {
  if (code === 0 && process.platform === 'linux' && args[0] === 'build') {
    const directory = await mkdtemp(join(tmpdir(), 'orcaw-tauri-glibc-'))
    try {
      const root = join(import.meta.dirname, '../..')
      await copyFile(
        join(
          root,
          'src-tauri/target',
          args.includes('--debug') ? 'debug' : 'release',
          'orcaw-tauri'
        ),
        join(directory, 'orcaw-tauri')
      )
      const { verifyLinuxGlibcFloor } = require('./verify-linux-glibc-floor.cjs')
      verifyLinuxGlibcFloor(directory)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  process.exit(code ?? 1)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
