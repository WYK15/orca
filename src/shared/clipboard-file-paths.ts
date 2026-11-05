import { isAbsolute } from 'node:path'

export function validateClipboardFilePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 4096) {
    throw new Error('Invalid native clipboard file list')
  }
  const paths: string[] = []
  let bytes = 0
  for (const path of value) {
    if (typeof path !== 'string' || path.includes('\0') || !isAbsolute(path)) {
      throw new Error('Invalid native clipboard file path')
    }
    bytes += Buffer.byteLength(path)
    if (bytes > 1024 * 1024) {
      throw new Error('Clipboard file list is too large')
    }
    paths.push(path)
  }
  return [...new Set(paths)]
}
