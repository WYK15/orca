import type { EditorView } from '@codemirror/view'
import { isMap, isScalar, parseDocument } from 'yaml'
import { Button } from '@/components/ui/button'
import { MarkdownReactWidget } from './markdown-react-widget'
import { navigateMarkdownSource } from './markdown-document-navigation'

export class MarkdownMetadataWidget extends MarkdownReactWidget {
  protected readonly className = 'live-md-metadata'
  constructor(
    readonly source: string,
    readonly position: number,
    readonly contentFrom: number
  ) {
    super()
  }
  eq(other: MarkdownMetadataWidget): boolean {
    return this.source === other.source && this.position === other.position
  }
  protected render(view: EditorView) {
    const body = this.source
      .replace(/^\ufeff?---[^\n]*\n/, '')
      .replace(/\n(?:---|\.\.\.)[\t ]*$/, '')
    const document = parseDocument(body)
    const title = isMap(document.contents) ? document.get('title', true) : null
    const summary = isScalar(title)
      ? String(title.value ?? '')
      : isMap(document.contents)
        ? document.contents.items
            .slice(0, 5)
            .map((item) => (isScalar(item.key) ? String(item.key.value) : ''))
            .filter(Boolean)
            .join(' · ')
        : 'YAML'
    return (
      <div>
        <div className="live-md-document-block-header">
          <span>元数据</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => navigateMarkdownSource(view, this.contentFrom)}
          >
            编辑元数据
          </Button>
        </div>
        <p className="text-muted-foreground">
          {document.errors.length ? 'YAML 语法有误，点击编辑可修正' : summary || '暂无元数据'}
        </p>
      </div>
    )
  }
}
