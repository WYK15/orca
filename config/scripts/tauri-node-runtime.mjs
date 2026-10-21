import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const TAURI_NODE_VERSION = '24.22.0'

async function download(url) {
  console.log(`Downloading ${url}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) })
  if (!response.ok) {
    throw new Error(`Node runtime download failed: ${response.status} ${url}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

export async function prepareTauriNode(root) {
  const directory = join(root, 'out/tauri-node')
  const base = `node-v${TAURI_NODE_VERSION}-${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`
  const extension = process.platform === 'win32' ? 'zip' : 'tar.gz'
  const archiveName = `${base}.${extension}`
  const origin = `https://nodejs.org/dist/v${TAURI_NODE_VERSION}`
  const executable = join(directory, base, process.platform === 'win32' ? 'node.exe' : 'bin/node')
  const license = join(directory, base, 'LICENSE')
  try {
    await access(executable)
    await access(license)
    return { executable, license }
  } catch {
    await mkdir(directory, { recursive: true })
  }
  const manifest = (await download(`${origin}/SHASUMS256.txt`)).toString('utf8')
  const expected = manifest
    .split('\n')
    .find((line) => line.endsWith(`  ${archiveName}`))
    ?.split(' ')[0]
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error(`No official Node checksum for ${archiveName}`)
  }
  const archive = await download(`${origin}/${archiveName}`)
  const digest = createHash('sha256').update(archive).digest('hex')
  if (digest !== expected) {
    throw new Error(`Node runtime checksum mismatch: ${archiveName}`)
  }
  const archivePath = join(directory, archiveName)
  await writeFile(archivePath, archive)
  execFileSync('tar', ['-xf', archivePath, '-C', directory], { stdio: 'inherit' })
  if (process.platform !== 'win32') {
    await chmod(executable, 0o755)
  }
  await readFile(license)
  return { executable, license }
}
