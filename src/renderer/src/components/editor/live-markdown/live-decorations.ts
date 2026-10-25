import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { markdownEditorMode, markdownEditorContext, revealedTableField } from './editor-context'
import {
  ListMarkerWidget,
  TaskMarkerWidget,
  MarkdownImageWidget,
  CodeLanguageWidget
} from './inline-widgets'
import { parseMarkdownTable } from './table-source'
import { MarkdownTableWidget } from './table-widget'
import { MarkdownEntityWidget, MarkdownHtmlWidget, MarkdownMathWidget } from './rendered-widgets'
import { MarkdownDiagramWidget } from './diagram-widget'
import { tableCellSelection } from './table-cell-selection'

function active(state: EditorState, from: number, to: number): boolean {
  if (state.facet(markdownEditorMode) === 'preview') {
    return false
  }
  return state.selection.ranges.some((range) =>
    range.empty ? range.head >= from && range.head <= to : range.from < to && range.to > from
  )
}

function buildDecorations(state: EditorState): DecorationSet {
  const mode = state.facet(markdownEditorMode)
  if (mode === 'source') {
    return Decoration.none
  }
  const ranges: Range<Decoration>[] = []
  const text = state.doc.toString()
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
      if (mode === 'live' && /^ATXHeading\d$/.test(name) && !/^#{1,6}[\t ]/.test(source)) {
        return false
      }
      if (name === 'Table' && state.field(revealedTableField, false) !== from) {
        const caret = state.selection.main
        const cell = state.field(tableCellSelection, false)
        const editingSource =
          mode !== 'preview' && caret.empty && caret.head > from && caret.head < to && !cell
        const table = parseMarkdownTable(text, from, to)
        const selectingAcross =
          mode !== 'preview' &&
          state.selection.ranges.some((range) => !range.empty && range.from < to && range.to > from)
        if (table && !selectingAcross && !editingSource) {
          ranges.push(
            Decoration.replace({
              widget: new MarkdownTableWidget(
                table,
                source,
                !state.readOnly,
                state.facet(markdownEditorContext).version,
                cell && cell.from >= from && cell.to <= to ? cell : null,
                caret.head
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
          !state.selection.ranges.some(
            (range) => !range.empty && range.from < to && range.to > from
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
        if (!active(state, from, to)) {
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
          ranges.push(Decoration.replace({ widget: new ListMarkerWidget(source) }).range(from, to))
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
      if (
        name === 'HTMLBlock' &&
        !active(state, from, to) &&
        !/<(?:script|style|iframe|[A-Z][\w.]*)\b/.test(source)
      ) {
        ranges.push(
          Decoration.replace({
            block: true,
            widget: new MarkdownHtmlWidget(source, from, state.facet(markdownEditorContext).version)
          }).range(from, to)
        )
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
      if (
        name === 'Paragraph' &&
        /^\$\$\s*\n[\s\S]*\n\$\$\s*$/.test(source) &&
        !active(state, from, to)
      ) {
        ranges.push(
          Decoration.replace({
            block: true,
            widget: new MarkdownMathWidget(
              source.replace(/^\$\$\s*\n/, '').replace(/\n\$\$\s*$/, ''),
              true,
              from
            )
          }).range(from, to)
        )
        return false
      }
      if (name === 'Image') {
        const match = source.match(/^!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\s*\)$/)
        if (match) {
          const widget = new MarkdownImageWidget(
            match[2] ?? match[3],
            match[1],
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
      if (name === 'Link') {
        const label = source.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (label) {
          mark(from, to, 'live-md-link')
          if (!active(state, from, to)) {
            hide(from, from + 1)
            hide(from + 1 + label[1].length, to)
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
