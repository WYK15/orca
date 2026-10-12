import type { PersistedOpenFile } from '../../../shared/types'
import type { OpenFile } from '../store/slices/editor'

export function buildPersistedEditorFile(
  f: OpenFile,
  draft: string | undefined
): PersistedOpenFile {
  // Why: never persist a dirty draft for a read-only tab — restoring one would reintroduce writable/hot-exit state for an agent transcript.
  const dirtyDraftContent = f.isDirty && f.readOnly !== true ? draft : undefined
  return {
    filePath: f.filePath,
    relativePath: f.relativePath,
    worktreeId: f.worktreeId,
    language: f.language,
    isPreview: f.isPreview || undefined,
    runtimeEnvironmentId: f.runtimeEnvironmentId,
    externalSshTargetId: f.externalSshTargetId,
    // Why: persist readOnly only when true; absence is the writable default on restore.
    ...(f.readOnly === true ? { readOnly: true } : {}),
    ...(f.readOnly === true && f.liveTail === true ? { liveTail: true } : {}),
    ...(dirtyDraftContent !== undefined ? { dirtyDraftContent } : {}),
    ...(dirtyDraftContent !== undefined && f.markdownSaveRecovery
      ? { markdownSaveRecovery: f.markdownSaveRecovery }
      : {}),
    // Why: baseline travels with the draft so restore can detect a changed-on-disk conflict before autosave clobbers an offline agent write.
    ...(dirtyDraftContent !== undefined && f.lastKnownDiskSignature
      ? { lastKnownDiskSignature: f.lastKnownDiskSignature }
      : {})
  }
}
