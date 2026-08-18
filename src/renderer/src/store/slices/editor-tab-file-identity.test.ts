import { describe, expect, it } from 'vitest'
import { resolveLiveEditorTabEntityId } from './editor-tab-file-identity'

describe('resolveLiveEditorTabEntityId', () => {
  it('prefers an exact mode match and isolates workspaces and POSIX paths', () => {
    const file = {
      id: 'owned-file',
      filePath: 'c:/repo/a.md',
      relativePath: 'a.md',
      worktreeId: 'folder',
      language: 'markdown',
      isDirty: false,
      mode: 'markdown-preview' as const
    }
    expect(resolveLiveEditorTabEntityId([file], 'folder', 'editor', file.id)).toBe(file.id)
    expect(resolveLiveEditorTabEntityId([file], 'folder', 'editor', 'C:\\Repo\\a.md')).toBe(file.id)
    expect(resolveLiveEditorTabEntityId([file], 'other', 'editor', 'C:\\Repo\\a.md')).toBeNull()
    expect(resolveLiveEditorTabEntityId([file], 'folder', 'diff', file.id)).toBeNull()
    const posix = { ...file, id: '/repo/a.md', filePath: '/repo/a.md' }
    expect(resolveLiveEditorTabEntityId([posix], 'folder', 'editor', '/Repo/a.md')).toBeNull()
  })

  it('matches equivalent Windows path spellings', () => {
    const worktreeId = 'repo1::C:\\Repo'
    const openFiles = [
      {
        id: 'c:/repo/src/b.ts',
        filePath: 'c:/repo/src/b.ts',
        relativePath: 'src/b.ts',
        worktreeId,
        language: 'typescript',
        isDirty: false,
        mode: 'edit' as const
      }
    ]

    expect(
      resolveLiveEditorTabEntityId(openFiles, worktreeId, 'editor', 'C:\\Repo\\src\\b.ts')
    ).toBe('c:/repo/src/b.ts')
  })
})
