import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const output = join(root, 'out/tauri-backend')
await mkdir(output, { recursive: true })

await build({
  entryPoints: [join(root, 'src/desktop-host/index.ts')],
  outfile: join(output, 'desktop-host.cjs'),
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  bundle: true,
  minify: true,
  metafile: true,
  loader: { '.png': 'file', '.mp3': 'file', '.icns': 'file', '.ico': 'file' },
  external: ['node-pty', '@parcel/watcher', 'ssh2', 'cpu-features', 'windows-native-registry'],
  alias: {
    electron: join(root, 'src/desktop-host/electron-port.ts'),
    'jsonc-parser': join(root, 'node_modules/jsonc-parser/lib/esm/main.js')
  },
  define: { 'process.env.NODE_ENV': '"production"', ORCA_FEATURE_WALL_ENABLED: 'false' }
})

await build({
  entryPoints: [join(root, 'src/main/ipc/parcel-watcher-process-entry.ts')],
  outfile: join(output, 'parcel-watcher-process-entry.js'),
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  bundle: true,
  minify: true,
  external: ['@parcel/watcher']
})
await copyFile(join(root, 'package.json'), join(output, 'package.json'))
console.log('Built standalone Tauri backend (no Electron runtime).')
