import { basename, dirname, joinPath, getRelativePathInsideRoot } from '@/lib/path'
import { validMarkdownImageFolder } from './markdown-writing-preferences'

export function markdownAssetDirectory(filePath: string, folder: string): string {
  if (!validMarkdownImageFolder(folder)) {
    throw new Error('图片资源目录必须位于文档目录内')
  }
  const name = basename(filePath).replace(/\.[^.]+$/, '')
  const relative = folder
    .replaceAll('{filename}', name)
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/')
  return relative ? joinPath(dirname(filePath), relative) : dirname(filePath)
}

export function markdownAssetReference(filePath: string, imagePath: string): string {
  const relative = getRelativePathInsideRoot(imagePath, dirname(filePath))
  if (!relative) {
    throw new Error('导入的图片不在文档目录内')
  }
  return relative.replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/')
}
