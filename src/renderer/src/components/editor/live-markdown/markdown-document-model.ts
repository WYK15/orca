import { StateField, type EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { Tree } from '@lezer/common'
import { MarkdownHeadingSlugger } from '../markdown-heading-slug'
import { stripInlineMarkdownForToc } from '../markdown-table-of-contents'

export type MarkdownDocumentHeading = { from: number; level: number; title: string; id: string }
export type MarkdownFootnoteDefinition = {
  id: string
  from: number
  to: number
  contentFrom: number
  body: string
}
export type MarkdownFootnote = MarkdownFootnoteDefinition & {
  number: number
  references: { from: number; to: number }[]
}
export type MarkdownDocumentModel = {
  headings: MarkdownDocumentHeading[]
  definitions: Map<string, MarkdownFootnoteDefinition>
  notes: MarkdownFootnote[]
  references: Map<number, MarkdownFootnote>
}

export const footnoteLabelKey = (label: string): string => label.trim().toLowerCase()

export function buildMarkdownDocument(
  state: EditorState,
  tree: Tree = syntaxTree(state)
): MarkdownDocumentModel {
  const headings: MarkdownDocumentHeading[] = []
  const definitions = new Map<string, MarkdownFootnoteDefinition>()
  const references: { id: string; from: number; to: number }[] = []
  const slugger = new MarkdownHeadingSlugger()
  tree.iterate({
    enter(node) {
      if (
        [
          'FrontMatter',
          'FencedCode',
          'CodeBlock',
          'HTMLBlock',
          'Image',
          'InlineHtml',
          'InlineCode',
          'InlineMath',
          'DisplayMath'
        ].includes(node.name)
      ) {
        return false
      }
      if (/^(?:ATX|Setext)Heading[1-6]$/.test(node.name)) {
        const marks = node.node.getChildren('HeaderMark')
        const raw = node.name.startsWith('ATX')
          ? state.sliceDoc(marks[0].to, marks.length > 1 ? marks.at(-1)!.from : node.to)
          : state.sliceDoc(node.from, node.to).split('\n')[0]
        const title = stripInlineMarkdownForToc(raw)
        if (title) {
          headings.push({
            from: node.from,
            level: Number(node.name.at(-1)),
            title,
            id: slugger.slug(title)
          })
        }
        return false
      }
      if (node.name === 'FootnoteDefinition') {
        const source = state.sliceDoc(node.from, node.to)
        const match = source.match(/^\[\^([^\]\s]+)\]:[\t ]*/)
        if (match) {
          const id = footnoteLabelKey(match[1])
          if (!definitions.has(id)) {
            const lines = source.slice(match[0].length).split('\n')
            definitions.set(id, {
              id,
              from: node.from,
              to: node.to,
              contentFrom: node.from + match[0].length,
              body: [
                lines[0],
                ...lines.slice(1).map((line) => line.replace(/^(?: {4}|\t)/, ''))
              ].join('\n')
            })
          }
        }
        return false
      }
      if (node.name === 'FootnoteReference') {
        const source = state.sliceDoc(node.from, node.to)
        references.push({ id: footnoteLabelKey(source.slice(2, -1)), from: node.from, to: node.to })
      }
      return undefined
    }
  })
  const notes: MarkdownFootnote[] = []
  const numbered = new Map<string, MarkdownFootnote>()
  const resolved = new Map<number, MarkdownFootnote>()
  for (const reference of references) {
    const definition = definitions.get(reference.id)
    if (!definition) {
      continue
    }
    let note = numbered.get(reference.id)
    if (!note) {
      note = { ...definition, number: notes.length + 1, references: [] }
      numbered.set(reference.id, note)
      notes.push(note)
    }
    note.references.push({ from: reference.from, to: reference.to })
    resolved.set(reference.from, note)
  }
  return { headings, definitions, notes, references: resolved }
}

export const markdownDocumentModel = StateField.define<MarkdownDocumentModel>({
  create: buildMarkdownDocument,
  update(value, transaction) {
    return transaction.docChanged ||
      transaction.reconfigured ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? buildMarkdownDocument(transaction.state)
      : value
  }
})

export const readMarkdownDocument = (state: EditorState): MarkdownDocumentModel =>
  state.field(markdownDocumentModel, false) ?? buildMarkdownDocument(state)
