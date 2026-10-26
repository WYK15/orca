import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { markdownEditorMode, markdownEditorContext, revealedTableField } from './editor-context'
import { ListMarkerWidget, TaskMarkerWidget, CodeLanguageWidget } from './inline-widgets'
import { MarkdownImageWidget } from './markdown-image-widget'
import { parseMarkdownTable } from './table-source'
import { MarkdownTableWidget } from './table-widget'
import { MarkdownEntityWidget } from './rendered-widgets'
import {
  decorateMarkdownDocumentNode,
  appendMarkdownFootnotes
} from './markdown-document-decorations'
import { MarkdownDiagramWidget } from './diagram-widget'
import { tableCellSelection } from './table-cell-selection'
import { tableGridSelection } from './table-grid-selection'
import { markdownSourceLinks, markdownSourceImages } from './markdown-links'
import { markdownRangeIsActive as active } from './markdown-caret-presentation'
import { markdownListNumbers } from './markdown-list-numbering'

function buildDecorations(state: EditorState): DecorationSet {
  const mode = state.facet(markdownEditorMode)
  if (mode === 'source') {
    return Decoration.none
  }
  const ranges: Range<Decoration>[] = []
  const text = state.doc.toString()
  const links = new Map(markdownSourceLinks(state).map((link) => [link.from, link]))
  const images = new Map(markdownSourceImages(state).map((image) => [image.from, image]))
  const listNumbers = markdownListNumbers(state)
  const lineClasses = new Map<number, Set<string>>()
  const line = (position: number, className: string): void => {
    const from = state.doc.lineAt(position).from
    const classes = lineClasses.get(from) ?? new Set()
    classes.add(className)
    lineClasses.set(from, classes)
  }
  const mark = (from: number, to: number, className: string): void => {
    if (to > from) {
      ranges.push(Decoration.mark({ class: className }).range(from, to))
    }
  }
  const hide = (from: number, to: number): void => {
    if (to > from) {
      ranges.push(Decoration.replace({}).range(from, to))
    }
  }
  syntaxTree(state).iterate({
    enter(node) {
      const { from, to, name } = node
      const source = text.slice(from, to)
      if (decorateMarkdownDocumentNode(state, node.node, ranges, line)) {
        return false
      }
      if (name === 'LinkReference' && mode === 'preview') {
        hide(from, to)
        return false
      }
      if (mode === 'live' && /^ATXHeading\d$/.test(name) && !/^#{1,6}[\t ]+\S/.test(source)) {
        return false
      }
      if (name === 'Table' && state.field(revealedTableField, false) !== from) {
        const caret = state.selection.main
        const cell = state.field(tableCellSelection, false)
        const grid = state.field(tableGridSelection, false)
        const editingSource =
          mode !== 'preview' &&
          caret.empty &&
          caret.head > from &&
          caret.head < to &&
          !cell &&
          grid?.tableFrom !== from
        const table = parseMarkdownTable(text, from, to)
        if (table && !editingSource) {
          ranges.push(
            Decoration.replace({
              widget: new MarkdownTableWidget(
                table,
                source,
                !state.readOnly,
                state.facet(markdownEditorContext).version,
                cell && cell.from >= from && cell.to <= to ? cell : null,
                caret.head,
                caret.anchor,
                grid?.tableFrom === from ? grid : null
              ),
              block: true
            }).range(from, to)
          )
          return false
        }
      }
      if (/^(ATX|Setext)Heading\d$/.test(name)) {
        line(from, `live-md-heading live-md-h${name.at(-1)}`)
      }
      if (name === 'HeaderMark') {
        const wholeLine = state.doc.lineAt(from)
        if (
          mode === 'preview' ||
          !state.selection.ranges.some((range) =>
            range.empty
              ? range.head >= from && range.head <= to + 1
              : range.from < to && range.to > from
          )
        ) {
          hide(from, Math.min(to + 1, wholeLine.to))
        }
      }
      if (
        name === 'StrongEmphasis' ||
        name === 'Emphasis' ||
        name === 'Strikethrough' ||
        name === 'InlineCode'
      ) {
        mark(
          from,
          to,
          name === 'StrongEmphasis'
            ? 'live-md-strong'
            : name === 'Emphasis'
              ? 'live-md-emphasis'
              : name === 'Strikethrough'
                ? 'live-md-strike'
                : 'live-md-inline-code'
        )
        if (!active(state, from, to, false)) {
          const length =
            name === 'InlineCode'
              ? (source.match(/^`+/)?.[0].length ?? 1)
              : name === 'StrongEmphasis' || name === 'Strikethrough'
                ? 2
                : 1
          hide(from, from + length)
          hide(to - length, to)
        }
      }
      if (name === 'ListMark') {
        line(from, 'live-md-list-line')
        if (!active(state, from, to + 1)) {
          ranges.push(
            Decoration.replace({
              widget: new ListMarkerWidget(listNumbers.get(from) ?? source)
            }).range(from, to)
          )
        }
      }
      if (name === 'TaskMarker') {
        ranges.push(
          Decoration.replace({
            widget: new TaskMarkerWidget(from, /x/i.test(source), mode === 'preview')
          }).range(from, to)
        )
      }
      if (name === 'Blockquote') {
        for (
          let number = state.doc.lineAt(from).number;
          number <= state.doc.lineAt(to).number;
          number++
        ) {
          line(state.doc.line(number).from, 'live-md-quote')
        }
      }
      if (name === 'QuoteMark' && !active(state, from, state.doc.lineAt(from).to)) {
        hide(from, Math.min(to + 1, state.doc.lineAt(to).to))
      }
      if (name === 'FencedCode' || name === 'CodeBlock') {
        const first = state.doc.lineAt(from).number
        const last = state.doc.lineAt(to).number
        if (
          name === 'FencedCode' &&
          /^\s*`{3,}mermaid\s*\n/.test(source) &&
          !active(state, from, to)
        ) {
          const body = source.replace(/^.*\n/, '').replace(/\n\s*`{3,}\s*$/, '')
          ranges.push(
            Decoration.replace({
              block: true,
              widget: new MarkdownDiagramWidget(body, state.doc.line(first + 1).from)
            }).range(from, to)
          )
          return false
        }
        for (let number = first; number <= last; number++) {
          line(state.doc.line(number).from, 'live-md-code-line')
        }
        if (name === 'FencedCode') {
          line(from, 'live-md-code-first')
          line(to, 'live-md-code-last')
          const opening = state.doc.line(first)
          const closing = state.doc.line(last)
          const language = opening.text.replace(/^\s*(?:`{3,}|~{3,})/, '').trim()
          if (!active(state, opening.from, opening.to)) {
            ranges.push(
              Decoration.replace({ widget: new CodeLanguageWidget(language, opening.to) }).range(
                opening.from,
                opening.to
              )
            )
          }
          if (
            last > first &&
            /^\s*(?:`{3,}|~{3,})\s*$/.test(closing.text) &&
            !active(state, closing.from, closing.to)
          ) {
            hide(closing.from, closing.to)
          }
        }
        return false
      }
      if ((name === 'Entity' || name === 'CharacterReference') && !active(state, from, to)) {
        ranges.push(
          Decoration.replace({ widget: new MarkdownEntityWidget(source) }).range(from, to)
        )
      }
      if (name === 'Escape' && !active(state, from, to)) {
        hide(from, Math.min(from + 1, to))
      }
      if (name === 'Image') {
        const image = images.get(from)
        if (image) {
          const widget = new MarkdownImageWidget(
            image.src,
            image.alt,
            from,
            mode !== 'preview',
            state.facet(markdownEditorContext).version
          )
          if (!active(state, from, to)) {
            ranges.push(Decoration.replace({ widget }).range(from, to))
          } else {
            ranges.push(Decoration.widget({ widget, side: 1 }).range(to))
          }
          return false
        }
      }
      if (name === 'Link' || name === 'Autolink' || name === 'URL') {
        const link = links.get(from)
        if (link) {
          mark(from, to, 'live-md-link')
          if (!active(state, from, to)) {
            hide(from, link.labelFrom)
            hide(link.labelTo, to)
          }
        }
      }
      if (name === 'HorizontalRule') {
        line(from, 'live-md-rule')
        if (!active(state, from, to)) {
          mark(from, to, 'live-md-hidden-rule')
        }
      }
      return undefined
    }
  })
  for (let number = 1; number <= state.doc.lines; number++) {
    const current = state.doc.line(number)
    if (!current.length && !lineClasses.get(current.from)?.has('live-md-code-line')) {
      line(current.from, 'live-md-spacer')
    }
  }
  for (const [from, classes] of lineClasses) {
    ranges.push(Decoration.line({ class: [...classes].join(' ') }).range(from))
  }
  appendMarkdownFootnotes(state, ranges)
  return Decoration.set(ranges, true)
}

export const liveMarkdownDecorations = StateField.define<DecorationSet>({
  create: buildDecorations,
  update(value, transaction) {
    return transaction.docChanged ||
      transaction.selection ||
      transaction.reconfigured ||
      transaction.effects.length ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? buildDecorations(transaction.state)
      : value
  },
  provide: (field) => EditorView.decorations.from(field)
})
