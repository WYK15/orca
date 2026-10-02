import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCodexAiVaultSession } from './codex-session-delete'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orcaw-codex-delete-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
const transcript = (id: string) => `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`
async function home(name: string) {
  const path = join(root, name)
  await mkdir(join(path, 'sessions'), { recursive: true })
  return path
}
function args(filePath: string) {
  return { agent: 'codex' as const, sessionId: 'a', filePath, executionHostId: 'local' as const }
}

describe('complete Codex deletion', () => {
  it('removes verified aliases and index entries in all known homes', async () => {
    const homes = await Promise.all(['default', 'managed', 'custom'].map(home))
    const paths = homes.map((h) => join(h, 'sessions', 'a.jsonl'))
    await writeFile(paths[0], transcript('a'))
    await link(paths[0], paths[1])
    await writeFile(paths[2], transcript('a'))
    for (const h of homes) {
      await writeFile(join(h, 'session_index.jsonl'), '{"id":"a"}\n{"id":"b"}\n')
    }
    const onDeleted = vi.fn()
    expect(
      await deleteCodexAiVaultSession(args(paths[0]), {
        defaultCodexHome: homes[0],
        managedCodexHome: homes[1],
        additionalCodexHomePaths: [homes[2]],
        trashItem: (path) => rm(path),
        onDeleted
      })
    ).toEqual({ outcome: 'deleted' })
    for (const path of paths) {
      await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    for (const h of homes) {
      await expect(readFile(join(h, 'session_index.jsonl'), 'utf8')).resolves.toBe('{"id":"b"}\n')
    }
    expect(onDeleted).toHaveBeenCalledWith(
      expect.arrayContaining(paths),
      expect.arrayContaining(homes)
    )
  })

  it('keeps transcripts when rewriting the index fails', async () => {
    const h = await home('default')
    const path = join(h, 'sessions', 'a.jsonl')
    await writeFile(path, transcript('a'))
    await writeFile(join(h, 'session_index.jsonl'), '{"id":"a"}\n')
    expect(
      await deleteCodexAiVaultSession(args(path), {
        defaultCodexHome: h,
        managedCodexHome: join(root, 'managed'),
        writeIndexAtomically: async () => {
          throw new Error('disk full')
        },
        trashItem: (p) => rm(p)
      })
    ).toEqual({ outcome: 'failed', agent: 'codex', error: 'disk full' })
    await expect(readFile(path, 'utf8')).resolves.toBe(transcript('a'))
  })

  it('rejects mismatched identity without changing the index', async () => {
    const h = await home('default')
    const path = join(h, 'sessions', 'a.jsonl')
    await writeFile(path, transcript('b'))
    await writeFile(join(h, 'session_index.jsonl'), '{"id":"a"}\n')
    expect(
      await deleteCodexAiVaultSession(args(path), {
        defaultCodexHome: h,
        managedCodexHome: join(root, 'managed')
      })
    ).toEqual({ outcome: 'rejected', agent: 'codex', reason: 'file-predicate-mismatch' })
    await expect(readFile(join(h, 'session_index.jsonl'), 'utf8')).resolves.toBe('{"id":"a"}\n')
  })

  it('rejects remote, WSL and outside-root paths before deleting', async () => {
    const deps = {
      defaultCodexHome: join(root, 'default'),
      managedCodexHome: join(root, 'managed'),
      trashItem: vi.fn()
    }
    for (const executionHostId of ['ssh:box', 'runtime:box'] as const) {
      expect(
        await deleteCodexAiVaultSession({ ...args('/remote/a.jsonl'), executionHostId }, deps)
      ).toMatchObject({ outcome: 'rejected', reason: 'non-local-host' })
    }
    expect(
      await deleteCodexAiVaultSession(args('\\\\wsl$\\Ubuntu\\home\\a.jsonl'), deps)
    ).toMatchObject({ outcome: 'rejected', reason: 'non-local-host' })
    expect(await deleteCodexAiVaultSession(args(join(root, 'outside.jsonl')), deps)).toMatchObject({
      outcome: 'rejected',
      reason: 'path-outside-known-roots'
    })
    expect(deps.trashItem).not.toHaveBeenCalled()
  })

  it.skipIf(process.platform === 'win32')(
    'does not follow a symlinked index outside the known home',
    async () => {
      const h = await home('default')
      const path = join(h, 'sessions', 'a.jsonl')
      const outside = join(root, 'outside-index.jsonl')
      await writeFile(path, transcript('a'))
      await writeFile(outside, '{"id":"a"}\n')
      await symlink(outside, join(h, 'session_index.jsonl'))
      expect(
        await deleteCodexAiVaultSession(args(path), {
          defaultCodexHome: h,
          managedCodexHome: join(root, 'managed')
        })
      ).toMatchObject({ outcome: 'rejected', reason: 'unexpected-target-kind' })
      await expect(readFile(path, 'utf8')).resolves.toBe(transcript('a'))
      await expect(readFile(outside, 'utf8')).resolves.toBe('{"id":"a"}\n')
    }
  )
})
