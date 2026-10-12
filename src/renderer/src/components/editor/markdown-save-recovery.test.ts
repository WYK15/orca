import { describe, expect, it } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import { stageMarkdownSaveRecovery, resolveMarkdownSaveRecovery } from './markdown-save-recovery'

describe('Markdown recovery drafts', () => {
  const file: OpenFile = {
    id: 'doc',
    filePath: '/docs/guide.md',
    relativePath: 'guide.md',
    worktreeId: 'folder:docs',
    language: 'markdown',
    isDirty: false,
    isPreview: true,
    mode: 'edit',
    externalSshTargetId: 'ssh-host',
    runtimeEnvironmentId: 'remote'
  }
  const state = { openFiles: [file], editorDrafts: {}, markdownViewMode: {} }

  it('keeps edits and safe source separately, opens source mode and pins the dirty tab', () => {
    const next = stageMarkdownSaveRecovery(state, 'doc', 'edited draft', 'safe source')
    expect(next.editorDrafts.doc).toBe('edited draft')
    expect(next.markdownViewMode.doc).toBe('source')
    expect(next.openFiles[0]).toEqual({
      ...file,
      isDirty: true,
      isPreview: false,
      markdownSaveRecovery: { source: 'safe source' }
    })
  })

  it('accepts the reviewed draft without discarding subsequent source edits', () => {
    const staged = stageMarkdownSaveRecovery(state, 'doc', 'draft', 'safe source')
    staged.editorDrafts.doc = 'reviewed draft'
    const next = { ...staged, ...resolveMarkdownSaveRecovery(staged, 'doc', 'accept') }
    expect(next.openFiles[0].markdownSaveRecovery).toBeUndefined()
    expect(next.editorDrafts.doc).toBe('reviewed draft')
  })

  it('restores the last safe source including earlier unsaved changes', () => {
    const staged = stageMarkdownSaveRecovery(state, 'doc', 'draft', 'safe unsaved source')
    const next = { ...staged, ...resolveMarkdownSaveRecovery(staged, 'doc', 'restore') }
    expect(next.editorDrafts.doc).toBe('safe unsaved source')
    expect(next.openFiles[0].isDirty).toBe(true)
    expect(next.openFiles[0].markdownSaveRecovery).toBeUndefined()
  })

  it('does not resurrect a closed file during teardown', () => {
    const closed = { ...state, openFiles: [] }
    expect(stageMarkdownSaveRecovery(closed, 'doc', 'draft', 'source')).toBe(closed)
  })
})
