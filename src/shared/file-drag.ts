export type NativeFileDragRequest = {
  paths: string[]
  worktreeId: string
}

export type NativeFileDragResult = { outcome: 'copied' | 'cancelled' }

/** Dragging a selected directory also carries its descendants. */
export function pruneFileDragPaths(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)]
  return unique.filter(
    (path) => !unique.some((parent) => parent !== path && path.startsWith(`${parent}/`))
  )
}
