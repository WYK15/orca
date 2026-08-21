import { link, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteCodexAiVaultSession } from './codex-session-delete'

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

async function createHome(root: string, name: string): Promise<string> {
  const home = join(root, name)
  await mkdir(join(home, 'sessions', '2026', '08', '05'), { recursive: true })
  return home
}

function transcript(sessionId: string): string {
  return `${JSON.stringify({ type: 'session_meta', payload: { id: sessionId, cwd: '/repo' } })}\n`
}

function deletionArgs(filePath: string, sessionId = 'session-a') {
  return {
    agent: 'codex' as const,
    filePath,
    sessionId,
    executionHostId: 'local' as const
  }
}

describe('deleteCodexAiVaultSession', () => {
  it('removes every verified transcript alias and its index records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-codex-delete-'))
    tempRoots.push(root)
    const defaultHome = await createHome(root, 'default')
    const managedHome = await createHome(root, 'managed')
    const customHome = await createHome(root, 'custom')
    const defaultPath = join(defaultHome, 'sessions', '2026', '08', '05', 'a.jsonl')
    const managedPath = join(managedHome, 'sessions', '2026', '08', '05', 'a.jsonl')
    const customPath = join(customHome, 'sessions', '2026', '08', '05', 'a.jsonl')
    await writeFile(defaultPath, transcript('session-a'))
    await link(defaultPath, managedPath)
    await writeFile(customPath, transcript('session-a'))
    await Promise.all(
      [defaultHome, managedHome, customHome].map((home) =>
        writeFile(
          join(home, 'session_index.jsonl'),
          `${JSON.stringify({ id: 'session-a', thread_name: 'Delete me' })}\n${JSON.stringify({ id: 'session-b', thread_name: 'Keep me' })}\n`
        )
      )
    )

    const result = await deleteCodexAiVaultSession(deletionArgs(defaultPath), {
      defaultCodexHome: defaultHome,
      managedCodexHome: managedHome,
      additionalCodexHomePaths: [customHome],
      trashItem: (path) => rm(path)
    })

    expect(result).toEqual({ outcome: 'deleted' })
    await expect(readFile(defaultPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(managedPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(customPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await Promise.all(
      [defaultHome, managedHome, customHome].map(async (home) => {
        await expect(readFile(join(home, 'session_index.jsonl'), 'utf8')).resolves.toBe(
          `${JSON.stringify({ id: 'session-b', thread_name: 'Keep me' })}\n`
        )
      })
    )
  })

  it('keeps transcripts when an index rewrite fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-codex-delete-'))
    tempRoots.push(root)
    const home = await createHome(root, 'default')
    const path = join(home, 'sessions', '2026', '08', '05', 'a.jsonl')
    await writeFile(path, transcript('session-a'))
    await writeFile(join(home, 'session_index.jsonl'), `${JSON.stringify({ id: 'session-a' })}\n`)

    const result = await deleteCodexAiVaultSession(deletionArgs(path), {
      defaultCodexHome: home,
      managedCodexHome: join(root, 'managed'),
      writeIndexAtomically: async () => {
        throw new Error('disk full')
      },
      trashItem: (target) => rm(target)
    })

    expect(result).toEqual({ outcome: 'failed', agent: 'codex', error: 'disk full' })
    await expect(readFile(path, 'utf8')).resolves.toBe(transcript('session-a'))
  })

  it('rejects a mismatched transcript and does not alter its index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-codex-delete-'))
    tempRoots.push(root)
    const home = await createHome(root, 'default')
    const path = join(home, 'sessions', '2026', '08', '05', 'a.jsonl')
    await writeFile(path, transcript('session-b'))
    const indexPath = join(home, 'session_index.jsonl')
    const index = `${JSON.stringify({ id: 'session-a' })}\n`
    await writeFile(indexPath, index)

    await expect(
      deleteCodexAiVaultSession(deletionArgs(path), {
        defaultCodexHome: home,
        managedCodexHome: join(root, 'managed'),
        trashItem: (target) => rm(target)
      })
    ).resolves.toEqual({ outcome: 'rejected', agent: 'codex', reason: 'file-predicate-mismatch' })
    await expect(readFile(path, 'utf8')).resolves.toBe(transcript('session-b'))
    await expect(readFile(indexPath, 'utf8')).resolves.toBe(index)
  })

  it('rejects remote and WSL UNC paths before touching the filesystem', async () => {
    const deps = {
      defaultCodexHome: '/home/ada/.codex',
      managedCodexHome: '/managed/codex',
      trashItem: async () => undefined
    }
    await expect(
      deleteCodexAiVaultSession(
        { ...deletionArgs('/home/ada/.codex/sessions/a.jsonl'), executionHostId: 'ssh:box' },
        deps
      )
    ).resolves.toEqual({ outcome: 'rejected', agent: 'codex', reason: 'non-local-host' })
    await expect(
      deleteCodexAiVaultSession(
        deletionArgs('\\\\wsl$\\Ubuntu\\home\\ada\\.codex\\sessions\\a.jsonl'),
        deps
      )
    ).resolves.toEqual({ outcome: 'rejected', agent: 'codex', reason: 'non-local-host' })
  })
})
