import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateClipboardFilePaths } from './clipboard-file-paths'

describe('native clipboard file paths', () => {
  it('preserves Unicode, spaces and folders and removes repeated references', () => {
    const paths = [resolve('/tmp/中文 图片.png'), resolve('/tmp/a folder')]
    expect(validateClipboardFilePaths([...paths, paths[0]])).toEqual(paths)
    expect(validateClipboardFilePaths([])).toEqual([])
  })
  it('rejects malformed, relative and oversized native responses', () => {
    for (const value of [
      null,
      'file:///tmp/file',
      ['relative.txt'],
      [9],
      [`${resolve('/tmp/file')}\0`],
      Array.from({ length: 4097 }, () => resolve('/tmp/file')),
      [resolve(`/tmp/${'x'.repeat(1024 * 1024)}`)]
    ]) {
      expect(() => validateClipboardFilePaths(value)).toThrow()
    }
  })
})
