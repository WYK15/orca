import { EditorView } from '@codemirror/view'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { MarkdownReactWidget } from './markdown-react-widget'
import { MarkdownFragment } from './MarkdownFragment'
import type { MarkdownFootnote } from './markdown-document-model'
import { navigateMarkdownSource } from './markdown-document-navigation'

function sameNote(first: MarkdownFootnote, second: MarkdownFootnote): boolean {
  return (
    first.id === second.id &&
    first.number === second.number &&
    first.body === second.body &&
    first.from === second.from &&
    first.contentFrom === second.contentFrom &&
    first.references.length === second.references.length &&
    first.references.every(
      (reference, index) =>
        reference.from === second.references[index].from &&
        reference.to === second.references[index].to
    )
  )
}

export class MarkdownFootnoteReferenceWidget extends MarkdownReactWidget {
  protected readonly className = 'live-md-note-reference'
  protected readonly tagName = 'span' as const
  constructor(
    readonly from: number,
    readonly note: MarkdownFootnote,
    readonly mediaVersion = ''
  ) {
    super()
  }
  eq(other: MarkdownFootnoteReferenceWidget): boolean {
    return (
      this.from === other.from &&
      this.mediaVersion === other.mediaVersion &&
      sameNote(this.note, other.note)
    )
  }
  protected render(view: EditorView) {
    return (
      <HoverCard openDelay={250}>
        <HoverCardTrigger asChild>
          <a
            href={`#footnote-${this.note.number}`}
            aria-label={`脚注 ${this.note.number}`}
            onClick={(event) => {
              event.preventDefault()
              const target = view.dom.querySelector(`[data-footnote-number="${this.note.number}"]`)
              if (target) {
                target.scrollIntoView({ block: 'center' })
              } else {
                view.dispatch({
                  effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end' })
                })
              }
            }}
          >
            {this.note.number}
          </a>
        </HoverCardTrigger>
        <HoverCardContent
          className="live-md-fragment max-h-80 overflow-auto scrollbar-editor"
          align="start"
        >
          <MarkdownFragment content={this.note.body} view={view} />
          {!view.state.readOnly && (
            <div className="mt-2 flex gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => navigateMarkdownSource(view, this.note.contentFrom)}
              >
                编辑脚注
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => navigateMarkdownSource(view, this.from + 2)}
              >
                编辑引用
              </Button>
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    )
  }
}

export class MarkdownFootnotesWidget extends MarkdownReactWidget {
  protected readonly className = 'live-md-footnotes live-md-fragment'
  constructor(
    readonly notes: MarkdownFootnote[],
    readonly mediaVersion = ''
  ) {
    super()
  }
  eq(other: MarkdownFootnotesWidget): boolean {
    return (
      this.mediaVersion === other.mediaVersion &&
      this.notes.length === other.notes.length &&
      this.notes.every((note, index) => sameNote(note, other.notes[index]))
    )
  }
  protected render(view: EditorView) {
    return (
      <section aria-label="脚注">
        <ol>
          {this.notes.map((note) => (
            <li key={note.id} value={note.number} data-footnote-number={note.number}>
              <MarkdownFragment content={note.body} view={view} />
              <div className="live-md-footnote-actions">
                {note.references.map((reference, index) => (
                  <Button
                    key={reference.from}
                    variant="ghost"
                    size="xs"
                    onClick={() => navigateMarkdownSource(view, reference.from)}
                  >
                    {note.references.length > 1 ? `返回引用 ${index + 1}` : '返回引用'}
                  </Button>
                ))}
                {!view.state.readOnly && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => navigateMarkdownSource(view, note.contentFrom)}
                  >
                    编辑脚注
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    )
  }
}
