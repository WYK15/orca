/**
 * Linear undo/redo for file explorer mutations (delete, create, rename).
 * Uses in-memory closures so each step carries the exact paths/content needed
 * to reverse or replay the operation without relying on OS trash restore
 * (which is not exposed in a portable way here).
 */
const MAX_STEPS = 50

type ExplorerOp = {
  undo: () => Promise<void>
  redo: () => Promise<void>
}

const past: ExplorerOp[] = []
const future: ExplorerOp[] = []
let applying = false
let revision = 0

export function commitFileExplorerOp(op: ExplorerOp): void {
  revision += 1
  past.push(op)
  if (past.length > MAX_STEPS) {
    past.shift()
  }
  future.length = 0
}

export function clearFileExplorerUndoHistory(): void {
  revision += 1
  past.length = 0
  future.length = 0
}

export async function undoFileExplorer(): Promise<boolean> {
  return applyHistoryStep(past, future, 'undo')
}

export async function redoFileExplorer(): Promise<boolean> {
  return applyHistoryStep(future, past, 'redo')
}

async function applyHistoryStep(
  source: ExplorerOp[],
  destination: ExplorerOp[],
  direction: 'undo' | 'redo'
): Promise<boolean> {
  if (applying) {
    return false
  }
  const op = source.at(-1)
  if (!op) {
    return false
  }
  applying = true
  const capturedRevision = revision
  try {
    await op[direction]()
    const index = source.lastIndexOf(op)
    if (index !== -1) {
      source.splice(index, 1)
    }
    if (revision === capturedRevision) {
      destination.push(op)
    }
    return true
  } finally {
    applying = false
  }
}

export function fileExplorerHasUndo(): boolean {
  return past.length > 0
}

export function fileExplorerHasRedo(): boolean {
  return future.length > 0
}
