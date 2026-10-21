import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, delimiter } from 'node:path'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The Tauri migration currently supports macOS ARM64 only.')
}
const targetOption = args.findIndex((arg) => arg === '--target' || arg === '-t')
const target =
  targetOption >= 0
    ? args[targetOption + 1]
    : args.find((arg) => arg.startsWith('--target='))?.slice(9)
if (target && target !== 'aarch64-apple-darwin') {
  throw new Error('The Tauri migration currently supports aarch64-apple-darwin only.')
}
const entry = join(dirname(require.resolve('@tauri-apps/cli/package.json')), 'tauri.js')
const child = spawn(process.execPath, [entry, ...args], {
  stdio: 'inherit',
  env: { ...process.env, PATH: [join(homedir(), '.cargo/bin'), process.env.PATH].join(delimiter) }
})
child.on('exit', (code) => {
  process.exit(code ?? 1)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
