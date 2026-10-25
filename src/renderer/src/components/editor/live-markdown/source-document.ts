import { StateEffect, StateField, type Extension, type Transaction } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'

export type MarkdownSourceDocument = {
  raw: string
  text: string
  lineStarts: number[]
  sourceLineStarts: number[]
  eol: string
}

export function createSourceDocument(raw: string): MarkdownSourceDocument {
  const lineStarts = [0]
  const sourceLineStarts = [0]
  const parts: string[] = []
  let sourceStart = 0
  let textLength = 0
  let eol = ''
  for (const match of raw.matchAll(/\r\n|\r|\n/g)) {
    const end = match.index
    const part = raw.slice(sourceStart, end)
    parts.push(part, '\n')
    textLength += part.length + 1
    sourceStart = end + match[0].length
    lineStarts.push(textLength)
    sourceLineStarts.push(sourceStart)
    eol ||= match[0]
  }
  parts.push(raw.slice(sourceStart))
  return { raw, text: parts.join(''), lineStarts, sourceLineStarts, eol: eol || '\n' }
}

function sourceOffset(source: MarkdownSourceDocument, offset: number): number {
  let low = 0
  let high = source.lineStarts.length
  while (low + 1 < high) {
    const middle = (low + high) >>> 1
    if (source.lineStarts[middle] <= offset) {
      low = middle
    } else {
      high = middle
    }
  }
  return source.sourceLineStarts[low] + offset - source.lineStarts[low]
}

export function applySourceTransaction(
  source: MarkdownSourceDocument,
  transaction: Transaction
): MarkdownSourceDocument {
  const parts: string[] = []
  let cursor = 0
  transaction.changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
    const rawFrom = sourceOffset(source, from)
    const rawTo = sourceOffset(source, to)
    parts.push(
      source.raw.slice(cursor, rawFrom),
      inserted.sliceString(0, inserted.length, source.eol)
    )
    cursor = rawTo
  })
  parts.push(source.raw.slice(cursor))
  return createSourceDocument(parts.join(''))
}

type SourceLineEnding = { position: number; eol: string }
const restoreLineEndings = StateEffect.define<SourceLineEnding[]>({
  map: (endings, changes) =>
    endings.map((ending) => ({ ...ending, position: changes.mapPos(ending.position) }))
})

function restoreSourceLineEndings(
  source: MarkdownSourceDocument,
  endings: SourceLineEnding[]
): MarkdownSourceDocument {
  const parts: string[] = []
  let cursor = 0
  const unique = new Map(endings.map((ending) => [ending.position, ending.eol]))
  for (const [position, eol] of [...unique].sort((a, b) => a[0] - b[0])) {
    if (source.text[position] !== '\n') {
      continue
    }
    const from = sourceOffset(source, position)
    const to = sourceOffset(source, position + 1)
    parts.push(source.raw.slice(cursor, from), eol)
    cursor = to
  }
  parts.push(source.raw.slice(cursor))
  return createSourceDocument(parts.join(''))
}

export const markdownSourceField = StateField.define<MarkdownSourceDocument>({
  create: (state) => createSourceDocument(state.doc.toString()),
  update(source, transaction) {
    const next = transaction.docChanged ? applySourceTransaction(source, transaction) : source
    const endings = transaction.effects.flatMap((effect) =>
      effect.is(restoreLineEndings) ? effect.value : []
    )
    return endings.length ? restoreSourceLineEndings(next, endings) : next
  }
})

export function markdownSourceExtensions(raw: string): Extension {
  return [
    markdownSourceField.init(() => createSourceDocument(raw)),
    invertedEffects.of((transaction) => {
      if (!transaction.docChanged) {
        return []
      }
      const source = transaction.startState.field(markdownSourceField)
      const removed: SourceLineEnding[] = []
      transaction.changes.iterChanges((from, to) => {
        for (
          let index = transaction.startState.doc.lineAt(from).number;
          index < source.lineStarts.length;
          index++
        ) {
          const position = source.lineStarts[index] - 1
          if (position < from) {
            continue
          }
          if (position >= to) {
            break
          }
          removed.push({
            position,
            eol: source.raw.slice(sourceOffset(source, position), source.sourceLineStarts[index])
          })
        }
      })
      return removed.length ? [restoreLineEndings.of(removed)] : []
    })
  ]
}
