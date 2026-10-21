import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'

const require = createRequire(import.meta.url)
const entry = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const args = process.argv.includes('--dev') ? [] : ['build']
const child = spawn(process.execPath, [entry, ...args, '--config', 'config/vite.tauri.config.ts'], {
  stdio: 'inherit'
})
child.on('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
