import type { EditorView } from '@codemirror/view'
import { Button } from '@/components/ui/button'
import { MarkdownReactWidget } from './markdown-react-widget'
import type { MarkdownDocumentHeading } from './markdown-document-model'
import { navigateMarkdownSource } from './markdown-document-navigation'

export class MarkdownTocWidget extends MarkdownReactWidget {
  protected readonly className = 'live-md-document-toc'
  constructor(
    readonly position: number,
    readonly headings: MarkdownDocumentHeading[],
    readonly readOnly: boolean
  ) {
    super()
  }
  eq(other: MarkdownTocWidget): boolean {
    return (
      this.position === other.position &&
      this.readOnly === other.readOnly &&
      this.headings.length === other.headings.length &&
      this.headings.every((heading, index) => {
        const otherHeading = other.headings[index]
        return (
          heading.from === otherHeading.from &&
          heading.id === otherHeading.id &&
          heading.title === otherHeading.title &&
          heading.level === otherHeading.level
        )
      })
    )
  }
  protected render(view: EditorView) {
    return (
      <nav aria-label="文内目录">
        <div className="live-md-document-block-header">
          <span>目录</span>
          {!this.readOnly && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => navigateMarkdownSource(view, this.position + 1)}
            >
              编辑目录标记
            </Button>
          )}
        </div>
        {this.headings.length ? (
          <ol>
            {this.headings.map((heading) => (
              <li key={heading.id} style={{ paddingInlineStart: (heading.level - 1) * 12 }}>
                <a
                  href={`#${heading.id}`}
                  data-toc-level={heading.level}
                  onClick={(event) => {
                    event.preventDefault()
                    navigateMarkdownSource(view, heading.from)
                  }}
                >
                  {heading.title}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">添加标题后会显示目录</p>
        )}
      </nav>
    )
  }
}
