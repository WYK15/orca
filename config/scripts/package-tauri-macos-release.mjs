import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, open, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Tauri releases require macOS ARM64.')
}
for (const key of [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
]) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing release credential: ${key}`)
  }
}

const root = resolve(import.meta.dirname, '../..')
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
if (!/^\d+\.\d+\.\d+-wyk\.\d+-tauri\.\d+$/.test(version)) {
  throw new Error('Only Tauri release versions may use this packager.')
}
const app = join(root, 'src-tauri/target/release/bundle/macos/Orcaw Tauri.app')
const output = join(root, 'out/tauri-artifacts')
const privateDirectory = await mkdtemp(join(tmpdir(), 'orcaw-tauri-signing-'))
const keychain = join(privateDirectory, 'release.keychain-db')
const certificate = join(privateDirectory, 'developer-id.p12')
const apiKey = join(privateDirectory, 'notary-key.p8')
const password = randomBytes(32).toString('base64')
let keychainCreated = false
let originalKeychains

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30 * 60_000,
      ...options
    })
  } catch (error) {
    // Never include argv: security commands receive passwords as arguments.
    throw new Error(
      `${basename(command)} failed: ${String(error.stderr ?? '') || error.code || error.status}`
    )
  }
}

async function machoFiles(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await machoFiles(path)))
    } else if (entry.isFile()) {
      const file = await open(path)
      try {
        const header = Buffer.alloc(4)
        const { bytesRead } = await file.read(header, 0, 4, 0)
        if (
          bytesRead === 4 &&
          [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(
            header.readUInt32BE()
          )
        ) {
          paths.push(path)
        }
      } finally {
        await file.close()
      }
    }
  }
  return paths
}

async function zipApp(path) {
  await rm(path, { force: true })
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, path])
}

async function notarize(path) {
  console.log(`Submitting ${basename(path)} for Apple notarization.`)
  const authentication = [
    '--key',
    apiKey,
    '--key-id',
    process.env.APPLE_API_KEY_ID,
    '--issuer',
    process.env.APPLE_API_ISSUER
  ]
  const result = JSON.parse(
    run('xcrun', [
      'notarytool',
      'submit',
      path,
      ...authentication,
      '--wait',
      '--timeout',
      '20m',
      '--output-format',
      'json'
    ])
  )
  if (result.status !== 'Accepted') {
    if (result.id) {
      console.error(run('xcrun', ['notarytool', 'log', result.id, ...authentication]))
    }
    throw new Error(`Apple notarization was not accepted: ${result.status}`)
  }
  console.log(`Apple accepted ${basename(path)} (${result.id}).`)
}

try {
  await writeFile(certificate, Buffer.from(process.env.CSC_LINK, 'base64'), { mode: 0o600 })
  await writeFile(apiKey, Buffer.from(process.env.APPLE_API_KEY, 'base64'), { mode: 0o600 })
  run('security', ['create-keychain', '-p', password, keychain])
  keychainCreated = true
  originalKeychains = [
    ...run('security', ['list-keychains', '-d', 'user']).matchAll(/"([^"]+)"/g)
  ].map((match) => match[1])
  run('security', ['list-keychains', '-d', 'user', '-s', keychain, ...originalKeychains])
  run('security', ['unlock-keychain', '-p', password, keychain])
  run('security', ['set-keychain-settings', '-lut', '21600', keychain])
  run('security', [
    'import',
    certificate,
    '-k',
    keychain,
    '-T',
    '/usr/bin/codesign',
    '-P',
    process.env.CSC_KEY_PASSWORD
  ])
  run('security', [
    'set-key-partition-list',
    '-S',
    'apple-tool:,apple:',
    '-s',
    '-k',
    password,
    keychain
  ])
  const identity = run('security', ['find-identity', '-v', '-p', 'codesigning', keychain]).match(
    /([A-Fa-f0-9]{40}) "Developer ID Application:/
  )?.[1]
  if (!identity) {
    throw new Error('The certificate has no valid Developer ID Application identity.')
  }
  const entitlements = join(privateDirectory, 'node-entitlements.plist')
  await writeFile(
    entitlements,
    '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>'
  )
  if (
    run('plutil', [
      '-extract',
      'CFBundleIdentifier',
      'raw',
      '-o',
      '-',
      join(app, 'Contents/Info.plist')
    ]).trim() !== 'com.wyk15.orcaw.tauri' ||
    run('plutil', [
      '-extract',
      'CFBundleShortVersionString',
      'raw',
      '-o',
      '-',
      join(app, 'Contents/Info.plist')
    ]).trim() !== version
  ) {
    throw new Error('Built application identity/version does not match the release.')
  }
  run('xattr', ['-cr', app])
  const targets = await machoFiles(join(app, 'Contents'))
  const node = join(app, 'Contents/MacOS/orcaw-node')
  if (!targets.includes(node) || !targets.includes(join(app, 'Contents/MacOS/orcaw-tauri'))) {
    throw new Error('The application is missing its native host or Node runtime.')
  }
  for (const path of [...targets, app]) {
    if (path !== app && !run('lipo', ['-archs', path]).trim().split(/\s+/).includes('arm64')) {
      throw new Error(`Native binary lacks ARM64 support: ${path}`)
    }
    const args = [
      '--force',
      '--sign',
      identity,
      '--keychain',
      keychain,
      '--timestamp',
      '--options',
      'runtime'
    ]
    if (path === node) {
      args.push('--entitlements', entitlements)
    }
    run('codesign', [...args, path])
  }
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  const ptySmoke = `require('@parcel/watcher');const p=require('node-pty').spawn('/bin/sh',['-c','printf signed-tauri-ok'],{cols:80,rows:24});let out='';p.onData(s=>out+=s);p.onExit(e=>process.exit(e.exitCode===0&&out.includes('signed-tauri-ok')?0:1));setTimeout(()=>process.exit(1),10000).unref()`
  run(node, ['-e', ptySmoke], { cwd: join(app, 'Contents/Resources/backend'), timeout: 15_000 })
  await mkdir(output, { recursive: true })
  const stem = `Orcaw-Tauri-${version}-macos-arm64`
  const zip = join(output, `${stem}.zip`)
  const dmg = join(output, `${stem}.dmg`)
  await zipApp(zip)
  await notarize(zip)
  run('xcrun', ['stapler', 'staple', app])
  run('xcrun', ['stapler', 'validate', app])
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app])
  await zipApp(zip)
  const imageRoot = join(privateDirectory, 'image')
  await mkdir(imageRoot)
  run('ditto', [app, join(imageRoot, basename(app))])
  await symlink('/Applications', join(imageRoot, 'Applications'))
  await rm(dmg, { force: true })
  run('hdiutil', [
    'create',
    '-volname',
    'Orcaw Tauri',
    '-srcfolder',
    imageRoot,
    '-format',
    'UDZO',
    '-ov',
    dmg
  ])
  run('codesign', ['--force', '--sign', identity, '--keychain', keychain, '--timestamp', dmg])
  await notarize(dmg)
  run('xcrun', ['stapler', 'staple', dmg])
  run('xcrun', ['stapler', 'validate', dmg])
  const checksums = []
  for (const path of [zip, dmg]) {
    const data = await readFile(path)
    checksums.push(`${createHash('sha256').update(data).digest('hex')}  ${basename(path)}`)
  }
  await writeFile(join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)
  console.log('Verified signed, notarized Mac ARM64 ZIP and DMG packages.')
} finally {
  if (keychainCreated) {
    if (originalKeychains) {
      try {
        run('security', ['list-keychains', '-d', 'user', '-s', ...originalKeychains])
      } catch {
        console.error('Could not restore the keychain search list.')
      }
    }
    try {
      run('security', ['delete-keychain', keychain])
    } catch {
      console.error('Could not delete the temporary signing keychain.')
    }
  }
  await rm(privateDirectory, { recursive: true, force: true })
}
