import { ipcMain } from 'electron'
import { open, stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import type { Store } from '../persistence'
import { resolveAuthorizedPath } from './filesystem-auth'

const maxImageBytes = 50 * 1024 * 1024
function imageMimeType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (/^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) {
    return 'image/gif'
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (bytes.toString('ascii', 0, 2) === 'BM') {
    return 'image/bmp'
  }
  if (bytes.length >= 6 && bytes.readUInt32LE(0) === 0x00010000) {
    return 'image/x-icon'
  }
  if (
    bytes.toString('ascii', 4, 8) === 'ftyp' &&
    /avif|avis/.test(bytes.toString('ascii', 8, 32))
  ) {
    return 'image/avif'
  }
  const prefix = bytes.toString('utf8', 0, Math.min(bytes.length, 65536))
  return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?<svg(?:\s|>)/i.test(
    prefix
  )
    ? 'image/svg+xml'
    : null
}

export async function readMarkdownImage(
  store: Store,
  args: { documentPath: string; imagePath: string }
): Promise<{ content: string; isBinary: true; isImage: true; mimeType: string }> {
  if (
    !args ||
    typeof args.documentPath !== 'string' ||
    typeof args.imagePath !== 'string' ||
    !isAbsolute(args.documentPath) ||
    !isAbsolute(args.imagePath) ||
    args.documentPath.includes('\0') ||
    args.imagePath.includes('\0') ||
    !/^\.(?:md|markdown|mdx)$/i.test(extname(args.documentPath))
  ) {
    throw new Error('Invalid Markdown image request')
  }
  const documentPath = await resolveAuthorizedPath(args.documentPath, store)
  if (!(await stat(documentPath)).isFile()) {
    throw new Error('Markdown document is not a file')
  }
  const before = await stat(args.imagePath)
  if (!before.isFile() || before.size > maxImageBytes) {
    throw new Error('Image must be a file of at most 50MB')
  }
  const file = await open(args.imagePath, 'r')
  try {
    const stats = await file.stat()
    if (!stats.isFile() || stats.size > maxImageBytes) {
      throw new Error('Image must be a file of at most 50MB')
    }
    const buffer = await file.readFile()
    if (buffer.length > maxImageBytes) {
      throw new Error('Image exceeds 50MB')
    }
    const mimeType = imageMimeType(buffer)
    if (!mimeType) {
      throw new Error('File is not a supported image')
    }
    return { content: buffer.toString('base64'), isBinary: true, isImage: true, mimeType }
  } finally {
    await file.close()
  }
}

export function registerMarkdownImageHandlers(store: Store): void {
  ipcMain.handle('fs:readMarkdownImage', (_event, args) => readMarkdownImage(store, args))
}
