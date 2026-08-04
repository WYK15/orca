import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installLinuxBareOrcaDispatcher } from './linux-bare-orca-dispatcher'

const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('installLinuxBareOrcaDispatcher', () => {
  it('does not create a bare Orca command for the fork', async () => {
    const homePath = await mkdtemp(join(tmpdir(), 'orcaw-dispatcher-'))
    cleanupPaths.push(homePath)

    await expect(
      installLinuxBareOrcaDispatcher({ resourcesPath: '/opt/Orcaw/resources', homePath })
    ).resolves.toEqual({
      state: 'skipped-fork-isolation',
      dispatcherPath: join(homePath, '.local', 'bin', 'orca'),
      target: null
    })
  })

  it('never overwrites an existing Orca command', async () => {
    const homePath = await mkdtemp(join(tmpdir(), 'orcaw-dispatcher-'))
    cleanupPaths.push(homePath)
    const commandPath = join(homePath, '.local', 'bin', 'orca')
    await mkdir(join(homePath, '.local', 'bin'), { recursive: true })
    await writeFile(commandPath, 'official-orca', 'utf8')

    await installLinuxBareOrcaDispatcher({ resourcesPath: '/opt/Orcaw/resources', homePath })

    await expect(readFile(commandPath, 'utf8')).resolves.toBe('official-orca')
  })
})
