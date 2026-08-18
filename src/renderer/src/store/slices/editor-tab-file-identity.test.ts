import { describe, expect, it } from 'vitest'
import { resolveLiveEditorTabEntityId } from './editor-tab-file-identity'

describe('resolveLiveEditorTabEntityId', () => {
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
