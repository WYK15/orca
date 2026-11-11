import { listen } from '@tauri-apps/api/event'
import {
  createNativeFileDropPayload,
  isNativeFileDropPayload,
  resolveNativeFileDropPath,
  type NativeFileDropPathEntry
} from '../../../shared/native-file-drop'
import { dispatchHostEvent } from './host-transport'
import { createNativeFileDragHover } from './file-drag-hover'

export function resolveDesktopFileDrop(value: unknown, target: Document = document) {
  if (isNativeFileDropPayload(value) && value.target === 'rejected') {
    return value
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const drop = value as { paths?: unknown; x?: unknown; y?: unknown; sourceWorktreeId?: unknown }
  if (
    !Array.isArray(drop.paths) ||
    !drop.paths.every((path) => typeof path === 'string') ||
    drop.paths.length === 0
  ) {
    return null
  }
  if (
    typeof drop.x !== 'number' ||
    typeof drop.y !== 'number' ||
    !Number.isFinite(drop.x) ||
    !Number.isFinite(drop.y)
  ) {
    return null
  }
  let element = target.elementFromPoint(drop.x, drop.y)
  const entries: NativeFileDropPathEntry[] = []
  while (element) {
    if (element instanceof HTMLElement) {
      entries.push({
        nativeFileDropTarget: element.dataset.nativeFileDropTarget,
        nativeFileDropEditorId: element.dataset.nativeFileDropEditorId,
        nativeFileDropDir: element.dataset.nativeFileDropDir,
        terminalTabId: element.dataset.terminalTabId,
        terminalPaneLeafId: element.dataset.terminalPaneLeafId ?? element.dataset.leafId
      })
    }
    element = element.parentElement
  }
  const payload = createNativeFileDropPayload(resolveNativeFileDropPath(entries), drop.paths)
  if (
    payload?.target === 'file-explorer' &&
    typeof drop.sourceWorktreeId === 'string' &&
    drop.sourceWorktreeId.length > 0 &&
    drop.sourceWorktreeId.length <= 4096
  ) {
    payload.sourceWorktreeId = drop.sourceWorktreeId
  }
  return payload
}

export async function installFileDrop(): Promise<() => void> {
  const hover = createNativeFileDragHover()
  document.addEventListener('dragend', hover.clear)
  const subscriptions = await Promise.all([
    listen('desktop:file-drag-hover', ({ payload }) => hover.update(payload)),
    listen('desktop:file-drop', ({ payload }) => {
      hover.clear()
      document.dispatchEvent(new Event('dragend', { bubbles: true }))
      const drop = resolveDesktopFileDrop(payload)
      if (drop) {
        dispatchHostEvent('terminal:file-drop', drop)
      }
    })
  ])
  return () => {
    hover.clear()
    document.removeEventListener('dragend', hover.clear)
    subscriptions.forEach((unsubscribe) => unsubscribe())
  }
}
