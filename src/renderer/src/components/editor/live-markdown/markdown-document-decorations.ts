import type { Range, EditorState } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { markdownEditorMode, markdownEditorContext } from './editor-context'
import { readMarkdownDocument } from './markdown-document-model'
import { markdownRangeIsActive } from './markdown-caret-presentation'
import { MarkdownTocWidget } from './markdown-toc-widget'
import { MarkdownMetadataWidget } from './markdown-metadata-widget'
import {
  MarkdownFootnoteReferenceWidget,
  MarkdownFootnotesWidget
} from './markdown-footnote-widgets'
import { MarkdownHtmlWidget, MarkdownMathWidget } from './rendered-widgets'
import { canPreviewMarkdownHtml } from './markdown-html-preview'

type LineDecoration = (position: number, className: string) => void

function sourceBlock(state: EditorState, from: number, to: number, line: LineDecoration): void {
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  for (let number = first; number <= last; number++) {
    line(state.doc.line(number).from, 'live-md-code-line')
  }
  line(from, 'live-md-code-first')
  line(to, 'live-md-code-last')
}

export function decorateMarkdownDocumentNode(
  state: EditorState,
  node: SyntaxNode,
  ranges: Range<Decoration>[],
  line: LineDecoration
): boolean {
  const { from, to, name } = node
  if (
    ![
      'FrontMatter',
      'DocumentToc',
      'InlineMath',
      'DisplayMath',
      'FootnoteReference',
      'FootnoteDefinition',
      'HTMLBlock',
      'CommentBlock',
      'InlineHtml',
      'InlineHtmlComment'
    ].includes(name)
  ) {
    return false
  }
  const mode = state.facet(markdownEditorMode)
  const source = state.sliceDoc(from, to)
  const version = state.facet(markdownEditorContext).version
  const replace = (widget?: Decoration['spec']['widget'], block = false): void => {
    ranges.push(Decoration.replace({ widget, block }).range(from, to))
  }
  if (name === 'FrontMatter') {
    if (mode === 'preview') {
      replace(undefined, true)
    } else if (markdownRangeIsActive(state, from, to)) {
      sourceBlock(state, from, to, line)
    } else {
      replace(new MarkdownMetadataWidget(source, from, from + source.indexOf('\n') + 1), true)
    }
    return true
  }
  if (name === 'DocumentToc') {
    if (!markdownRangeIsActive(state, from, to)) {
      replace(
        new MarkdownTocWidget(from, readMarkdownDocument(state).headings, state.readOnly),
        true
      )
    }
    return true
  }
  if (name === 'InlineMath') {
    if (!markdownRangeIsActive(state, from, to, false)) {
      replace(new MarkdownMathWidget(source.slice(1, -1), false, from, from + 1))
    }
    return true
  }
  if (name === 'DisplayMath') {
    const inline = /^\$\$.+\$\$[\t ]*$/.test(source)
    const closed = inline || /\n\s*\$\$[\t ]*$/.test(source)
    if (!closed || markdownRangeIsActive(state, from, to)) {
      sourceBlock(state, from, to, line)
    } else {
      const contentFrom = inline ? from + 2 : from + source.indexOf('\n') + 1
      const formula = inline
        ? source.slice(2).replace(/\$\$[\t ]*$/, '')
        : source.slice(source.indexOf('\n') + 1).replace(/\n\s*\$\$[\t ]*$/, '')
      replace(new MarkdownMathWidget(formula, true, from, contentFrom), true)
    }
    return true
  }
  if (name === 'FootnoteReference') {
    const note = readMarkdownDocument(state).references.get(from)
    if (note && !markdownRangeIsActive(state, from, to, false)) {
      replace(new MarkdownFootnoteReferenceWidget(from, note, version))
    }
    return true
  }
  if (name === 'FootnoteDefinition') {
    const model = readMarkdownDocument(state)
    const referenced = model.notes.some((note) => note.from === from)
    if (mode === 'preview' || (referenced && !markdownRangeIsActive(state, from, to))) {
      replace(undefined, true)
    } else {
      sourceBlock(state, from, to, line)
    }
    return true
  }
  if (['HTMLBlock', 'CommentBlock', 'InlineHtml', 'InlineHtmlComment'].includes(name)) {
    const inline = name === 'InlineHtml' || name === 'InlineHtmlComment'
    if (/^<!--[\s\S]*-->\s*$/.test(source) && mode === 'preview') {
      replace(undefined, !inline)
    } else if (canPreviewMarkdownHtml(source) && !markdownRangeIsActive(state, from, to, !inline)) {
      replace(new MarkdownHtmlWidget(source, from, version, inline), !inline)
    } else if (!inline) {
      sourceBlock(state, from, to, line)
    }
    return true
  }
  return false
}

export function appendMarkdownFootnotes(state: EditorState, ranges: Range<Decoration>[]): void {
  const notes = readMarkdownDocument(state).notes
  if (notes.length) {
    ranges.push(
      Decoration.widget({
        block: true,
        side: 1,
        widget: new MarkdownFootnotesWidget(notes, state.facet(markdownEditorContext).version)
      }).range(state.doc.length)
    )
  }
}
