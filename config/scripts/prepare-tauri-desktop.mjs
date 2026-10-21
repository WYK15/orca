import { spawnSync, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { cp, mkdir, copyFile, readFile, access, rm } from 'node:fs/promises'
import { resolve, join, dirname, basename, delimiter, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { prepareTauriNode } from './tauri-node-runtime.mjs'

const root = resolve(import.meta.dirname, '../..')
const backend = join(root, 'out/tauri-backend')
const resources = join(root, 'out/tauri-resources')
const binaryDir = join(root, 'src-tauri/binaries')
const nodeRuntime = await prepareTauriNode(root)
const node = nodeRuntime.executable
const runtime = JSON.parse(
  execFileSync(
    node,
    [
      '-p',
      'JSON.stringify({platform:process.platform,arch:process.arch,version:process.versions.node})'
    ],
    { encoding: 'utf8' }
  )
)
if (runtime.platform !== process.platform || runtime.arch !== process.arch) {
  throw new Error(
    'Tauri preparation requires a Node executable for the current host OS and architecture'
  )
}
if (Number(runtime.version.split('.')[0]) < 24) {
  throw new Error('Tauri backend requires Node 24 or newer')
}
const cargoEnv = {
  ...process.env,
  PATH: [join(homedir(), '.cargo/bin'), process.env.PATH].join(delimiter)
}
const target = execFileSync('rustc', ['--print', 'host-tuple'], {
  env: cargoEnv,
  encoding: 'utf8'
}).trim()
const rustArchitecture = { x64: 'x86_64', arm64: 'aarch64' }[process.arch]
const rustPlatform = {
  darwin: 'apple-darwin',
  win32: 'pc-windows-msvc',
  linux: 'unknown-linux-gnu'
}[process.platform]
if (!rustArchitecture || !rustPlatform || target !== `${rustArchitecture}-${rustPlatform}`) {
  throw new Error(
    `Rust host ${target} does not match ${process.platform}-${process.arch}; select a native Rust toolchain before preparing the sidecar`
  )
}
const executable = `orcaw-node-${target}${process.platform === 'win32' ? '.exe' : ''}`
for (const path of [backend, resources, binaryDir]) {
  await mkdir(path, { recursive: true })
}

const build = spawnSync(process.execPath, [join(root, 'config/scripts/build-tauri-backend.mjs')], {
  cwd: root,
  stdio: 'inherit'
})
if (build.status !== 0) {
  process.exit(build.status ?? 1)
}
await rm(join(binaryDir, executable), { force: true })
await copyFile(node, join(binaryDir, executable))
await copyFile(nodeRuntime.license, join(resources, 'node-LICENSE.txt'))
await rm(join(backend, 'node_modules'), { recursive: true, force: true })

const copied = new Set()
async function copyDependency(name, sourceRequire) {
  if (copied.has(name)) {
    return
  }
  let manifest
  try {
    manifest = sourceRequire.resolve(`${name}/package.json`)
  } catch {
    let directory = dirname(sourceRequire.resolve(name))
    for (;;) {
      try {
        await access(join(directory, 'package.json'))
        break
      } catch {
        const parent = dirname(directory)
        if (parent === directory) {
          throw new Error(`Could not locate manifest: ${name}`)
        }
        directory = parent
      }
    }
    manifest = join(directory, 'package.json')
  }
  const directory = dirname(manifest)
  const metadata = JSON.parse(await readFile(manifest, 'utf8'))
  if (metadata.os && !metadata.os.includes(process.platform)) {
    return
  }
  if (metadata.cpu && !metadata.cpu.includes(process.arch)) {
    return
  }
  copied.add(name)
  await cp(directory, join(backend, 'node_modules', name), {
    recursive: true,
    dereference: true,
    filter: (source) => {
      if (basename(source) === 'node_modules') {
        return false
      }
      if (name !== 'node-pty') {
        return true
      }
      if (source.endsWith('.pdb')) {
        return false
      }
      const parts = relative(directory, source).split(sep)
      if (parts[0] === 'prebuilds' && parts.length > 1) {
        return parts[1] === `${process.platform}-${process.arch}`
      }
      if (['third_party', 'deps', 'src', 'scripts', 'test', 'typings'].includes(parts[0])) {
        return false
      }
      if (parts[0] === 'build' && parts.length > 1) {
        if (parts[1] !== 'Release') {
          return false
        }
        if (parts[2] === 'conpty') {
          return true
        }
        return (
          parts.length === 2 ||
          /\.(node|dll|exe)$/.test(source) ||
          basename(source) === 'spawn-helper'
        )
      }
      return true
    }
  })
  const require = createRequire(manifest)
  for (const dependency of Object.keys(metadata.dependencies ?? {})) {
    await copyDependency(dependency, require)
  }
  for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) {
    try {
      await copyDependency(dependency, require)
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error
      }
    }
  }
}
const require = createRequire(join(root, 'package.json'))
for (const name of ['node-pty', '@parcel/watcher', 'ssh2']) {
  await copyDependency(name, require)
}
if (process.platform === 'win32') {
  await copyDependency('windows-native-registry', require)
}

const rgPackage = dirname(dirname(require.resolve('@vscode/ripgrep-universal')))
await cp(
  join(rgPackage, 'bin', `${process.platform}-${process.arch}`),
  join(resources, 'ripgrep'),
  { recursive: true }
)
await cp(join(root, 'resources/ripgrep'), join(resources, 'ripgrep'), { recursive: true })
await copyFile(join(rgPackage, 'LICENSE'), join(resources, 'ripgrep/LICENSE-wrapper'))

try {
  await access(join(root, 'out/relay/linux-x64/relay.js'))
} catch {
  const relay = spawnSync(process.execPath, [join(root, 'config/scripts/build-relay.mjs')], {
    cwd: root,
    stdio: 'inherit'
  })
  if (relay.status !== 0) {
    process.exit(relay.status ?? 1)
  }
}
await cp(join(root, 'out/relay'), join(resources, 'relay'), { recursive: true })
await copyFile(join(root, 'LICENSE'), join(resources, 'Orca-LICENSE'))
if (process.platform === 'linux') {
  const { verifyLinuxGlibcFloor } = require('./config/scripts/verify-linux-glibc-floor.cjs')
  for (const directory of [backend, resources, binaryDir]) {
    verifyLinuxGlibcFloor(directory)
  }
}

const ptySmoke = `const p=require('node-pty').spawn(process.platform==='win32'?'cmd.exe':'/bin/sh',process.platform==='win32'?['/c','echo tauri-native-ok']:['-c','printf tauri-native-ok'],{cols:80,rows:24,useConptyDll:process.platform==='win32'});let out='';p.onData(s=>out+=s);p.onExit(e=>process.exit(e.exitCode===0&&out.includes('tauri-native-ok')?0:1));setTimeout(()=>process.exit(1),10000).unref()`
const smoke = spawnSync(node, ['-e', ptySmoke], { cwd: backend, stdio: 'inherit', timeout: 15_000 })
if (smoke.status !== 0) {
  throw new Error(
    'The staged node-pty binary does not match the bundled Node runtime; rebuild native dependencies for Node before preparing Tauri'
  )
}
console.log(`Prepared Tauri backend for ${target}, Node ${runtime.version}.`)
