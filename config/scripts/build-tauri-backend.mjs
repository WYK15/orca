import { build } from 'esbuild'
import { mkdir, copyFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const output = join(root, 'out/tauri-backend')
await mkdir(output, { recursive: true })
await rm(join(output, 'plugin-host-entry.js'), { force: true })

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
  plugins: [
    {
      name: 'desktop-assets',
      setup(builder) {
        builder.onResolve({ filter: /\?asset$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path.slice(0, -6))
        }))
      }
    }
  ],
  external: ['node-pty', '@parcel/watcher', 'ssh2', 'cpu-features', 'windows-native-registry'],
  alias: {
    electron: join(root, 'src/desktop-host/electron-port.ts'),
    'jsonc-parser': join(root, 'node_modules/jsonc-parser/lib/esm/main.js')
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    ORCA_FEATURE_WALL_ENABLED: 'false',
    ORCA_PERSONAL_DESKTOP_ENABLED: 'true',
    ORCA_EMBEDDED_BROWSER_ENABLED: 'false'
  }
})

for (const [name, entry] of [
  ['parcel-watcher-process-entry', 'ipc/parcel-watcher-process-entry.ts'],
  ['daemon-entry', 'daemon/daemon-entry.ts']
]) {
  await build({
    entryPoints: [join(root, 'src/main', entry)],
    outfile: join(output, `${name}.js`),
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    bundle: true,
    minify: true,
    external: ['node-pty', '@parcel/watcher'],
    alias: { electron: join(root, 'src/desktop-host/electron-port.ts') },
    define: { 'process.env.NODE_ENV': '"production"' }
  })
}
await copyFile(join(root, 'package.json'), join(output, 'package.json'))
console.log('Built standalone Tauri backend (no Electron runtime).')
