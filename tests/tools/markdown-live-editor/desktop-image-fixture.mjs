import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

export async function createDesktopImageFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'orcaw-image-acceptance-'))
  const project = join(directory, 'project')
  const documentPath = join(project, 'note.md')
  const imagePath = join(directory, 'external image (one) #.png')
  const relativeImage = join(project, 'relative image.svg')
  const missingImage = join(directory, 'missing.png')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=',
    'base64'
  )
  await mkdir(project)
  await writeFile(documentPath, '# Media acceptance')
  await writeFile(imagePath, png)
  await writeFile(
    relativeImage,
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="gray"/></svg>'
  )
  let sequence = 0
  const pending = new Map()
  let diagnostics = ''
  const child = spawn(process.execPath, [resolve('out/tauri-backend/desktop-host.cjs')], {
    env: {
      ...process.env,
      ORCA_TAURI_USER_DATA: join(directory, 'data'),
      ORCA_TAURI_APP_ROOT: resolve('out/tauri-backend'),
      ORCA_TAURI_RESOURCES: resolve('out/tauri-resources')
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child.stderr.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-65536)
  })
  createInterface({ input: child.stdout }).on('line', (line) => {
    const frame = JSON.parse(line)
    if (frame.kind === 'native') {
      child.stdin.write(
        `${JSON.stringify({
          kind: 'native-result',
          id: frame.id,
          value: frame.channel === 'credential-key' ? Buffer.alloc(32, 42).toString('base64') : null
        })}\n`
      )
    } else if (frame.kind === 'result') {
      const task = pending.get(frame.id)
      pending.delete(frame.id)
      if (frame.error) {
        task?.reject(new Error(frame.error))
      } else {
        task?.resolve(frame.value)
      }
    }
  })
  const call = (channel, args = []) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${channel} timed out: ${diagnostics}`))
      }, 15000)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      })
      child.stdin.write(`${JSON.stringify({ id, kind: 'invoke', channel, args })}\n`)
    })
  const close = async () => {
    try {
      if (child.exitCode === null) {
        await call('app:awaitFirstWindowStartupServices')
        await call('pty:management:killAll')
      }
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, 'exit')
        const deadline = setTimeout(() => child.kill('SIGKILL'), 5000)
        child.stdin.end()
        await exited
        clearTimeout(deadline)
      }
      await rm(directory, { recursive: true, force: true })
    }
  }
  try {
    await call('desktop:bootstrap')
    await call('settings:set', [{ workspaceDir: join(directory, 'workspaces') }])
    await call('repos:add', [{ path: project, kind: 'folder' }])
    return {
      directory,
      project,
      documentPath,
      imagePath,
      relativeImage,
      missingImage,
      png,
      call,
      close
    }
  } catch (error) {
    await close()
    throw error
  }
}
