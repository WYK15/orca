import { expect, it } from 'vitest'
import {
  createNativeFileDropPayload,
  isNativeFileDropPayload,
  resolveNativeFileDropPath
} from './native-file-drop'

it('routes an image drop to the specific Markdown pane instead of opening an editor tab', () => {
  const resolution = resolveNativeFileDropPath([
    { nativeFileDropTarget: 'markdown', nativeFileDropEditorId: 'pane-2' },
    { nativeFileDropTarget: 'editor' }
  ])
  expect(resolution).toEqual({ target: 'markdown', editorId: 'pane-2' })
  const payload = createNativeFileDropPayload(resolution, ['/tmp/image.png'])
  expect(payload).toEqual({ target: 'markdown', editorId: 'pane-2', paths: ['/tmp/image.png'] })
  expect(isNativeFileDropPayload(payload)).toBe(true)
})

it('rejects drops without a destination pane and malformed Markdown drop payloads', () => {
  expect(resolveNativeFileDropPath([{ nativeFileDropTarget: 'markdown' }])).toEqual({
    target: 'rejected'
  })
  expect(isNativeFileDropPayload({ target: 'markdown', paths: ['/tmp/image.png'] })).toBe(false)
  expect(
    isNativeFileDropPayload({ target: 'markdown', editorId: '', paths: ['/tmp/image.png'] })
  ).toBe(false)
})

it('retains ordinary file-opening behavior for non-image drops', () => {
  expect(
    createNativeFileDropPayload({ target: 'markdown', editorId: 'pane' }, ['/tmp/manual.md'])
  ).toEqual({ target: 'editor', paths: ['/tmp/manual.md'] })
})
