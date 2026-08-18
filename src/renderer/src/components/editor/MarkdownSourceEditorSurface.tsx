import { useMemo, type ReactNode } from 'react'
import { MarkdownTableOfContentsPanel } from './MarkdownTableOfContentsPanel'
import type { MarkdownTocItem } from './markdown-table-of-contents'
import { selectMarkdownTableOfContents } from './markdown-toc-visibility-gate'

function findMarkdownTocLine(items: MarkdownTocItem[], id: string): number | null {
  for (const item of items) {
    if (item.id === id) {
      return item.line
    }
    const childLine = findMarkdownTocLine(item.children, id)
    if (childLine !== null) {
      return childLine
    }
  }
  return null
}

export function MarkdownSourceEditorSurface({
  children,
  content,
  onCloseTableOfContents,
  onNavigateLine,
  showTableOfContents
}: {
  children: ReactNode
  content: string
  onCloseTableOfContents: () => void
  onNavigateLine: (line: number) => void
  showTableOfContents: boolean
}): React.JSX.Element {
  const tableOfContentsItems = useMemo(
    () => selectMarkdownTableOfContents(showTableOfContents, content),
    [content, showTableOfContents]
  )

  return (
    <div className="flex h-full min-h-0">
      {showTableOfContents ? (
        <MarkdownTableOfContentsPanel
          items={tableOfContentsItems}
          onClose={onCloseTableOfContents}
          onNavigate={(id) => {
            const line = findMarkdownTocLine(tableOfContentsItems, id)
            if (line !== null) {
              onNavigateLine(line)
            }
          }}
        />
      ) : null}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  )
}
