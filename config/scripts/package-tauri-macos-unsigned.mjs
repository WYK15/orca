import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Tauri releases require macOS ARM64.')
}

const root = resolve(import.meta.dirname, '../..')
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
if (!/^\d+\.\d+\.\d+-wyk\.\d+-tauri\.\d+$/.test(version)) {
  throw new Error('Only Tauri release versions may use this packager.')
}
const app = join(root, 'src-tauri/target/release/bundle/macos/Orcaw Tauri.app')
const output = join(root, 'out/tauri-artifacts')
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5 * 60_000,
    ...options
  })

for (const [key, expected] of [
  ['CFBundleIdentifier', 'com.wyk15.orcaw.tauri'],
  ['CFBundleShortVersionString', version]
]) {
  if (
    run('plutil', ['-extract', key, 'raw', '-o', '-', join(app, 'Contents/Info.plist')]).trim() !==
    expected
  ) {
    throw new Error('Built application identity/version does not match the release.')
  }
}

for (const name of ['orcaw-tauri', 'orcaw-node']) {
  if (
    !run('lipo', ['-archs', join(app, 'Contents/MacOS', name)])
      .trim()
      .split(/\s+/)
      .includes('arm64')
  ) {
    throw new Error(`Native binary lacks ARM64 support: ${name}`)
  }
}
const node = join(app, 'Contents/MacOS/orcaw-node')
const smoke = `require('@parcel/watcher');const p=require('node-pty').spawn('/bin/sh',['-c','printf unsigned-tauri-ok'],{cols:80,rows:24});let out='';p.onData(s=>out+=s);p.onExit(e=>process.exit(e.exitCode===0&&out.includes('unsigned-tauri-ok')?0:1));setTimeout(()=>process.exit(1),10000).unref()`
run(node, ['-e', smoke], { cwd: join(app, 'Contents/Resources/backend'), timeout: 15_000 })

const staging = await mkdtemp(join(tmpdir(), 'orcaw-tauri-unsigned-'))
try {
  await mkdir(output, { recursive: true })
  const stem = `Orcaw-Tauri-${version}-macos-arm64`
  const zip = join(output, `${stem}.zip`)
  const dmg = join(output, `${stem}.dmg`)
  await rm(zip, { force: true })
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip])
  run('ditto', [app, join(staging, basename(app))])
  await symlink('/Applications', join(staging, 'Applications'))
  await rm(dmg, { force: true })
  run('hdiutil', [
    'create',
    '-volname',
    'Orcaw Tauri',
    '-srcfolder',
    staging,
    '-format',
    'UDZO',
    '-ov',
    dmg
  ])
  run('hdiutil', ['verify', dmg])
  const checksums = []
  for (const path of [zip, dmg]) {
    checksums.push(
      `${createHash('sha256')
        .update(await readFile(path))
        .digest('hex')}  ${basename(path)}`
    )
  }
  await writeFile(join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)
  console.log('Packaged unsigned Mac ARM64 ZIP and DMG; Developer ID and notarization skipped.')
} finally {
  await rm(staging, { recursive: true, force: true })
}
