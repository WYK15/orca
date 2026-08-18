import type { ReactNode } from 'react'
import { useAppStore } from '@/store'
import type { MarkdownViewMode, OpenFile } from '@/store/slices/editor'
import type { FileContent } from './editor-panel-content-types'
import { MarkdownSourceEditorSurface } from './MarkdownSourceEditorSurface'

export function EditorMarkdownSourceOutline({
  activeFile,
  fileContent,
  editBuffer,
  isMarkdown,
  mdViewMode,
  isChangesMode,
  showTableOfContents,
  onCloseTableOfContents,
  children
}: {
  activeFile: OpenFile
  fileContent: FileContent | undefined
  editBuffer: string | undefined
  isMarkdown: boolean
  mdViewMode: MarkdownViewMode
  isChangesMode: boolean
  showTableOfContents: boolean
  onCloseTableOfContents: () => void
  children: ReactNode
}): React.JSX.Element {
  const setPendingEditorReveal = useAppStore((state) => state.setPendingEditorReveal)
  const content = editBuffer ?? fileContent?.content
  if (
    !isMarkdown ||
    mdViewMode !== 'source' ||
    isChangesMode ||
    activeFile.conflict?.kind === 'conflict-placeholder' ||
    fileContent?.isBinary !== false ||
    fileContent.loadError !== undefined ||
    content === undefined
  ) {
    return <>{children}</>
  }
  return (
    <MarkdownSourceEditorSurface
      content={content}
      showTableOfContents={showTableOfContents}
      onCloseTableOfContents={onCloseTableOfContents}
      onNavigateLine={(line) =>
        setPendingEditorReveal({
          fileId: activeFile.id,
          filePath: activeFile.filePath,
          line,
          column: 1,
          matchLength: 0
        })
      }
    >
      {children}
    </MarkdownSourceEditorSurface>
  )
}
