import { EditorState, type ChangeSpec, type Transaction } from '@codemirror/state'
import type { SyntaxNode, Tree } from '@lezer/common'
import { markdownEditorMode } from './editor-context'
import { readMarkdownDocumentTree } from './markdown-document-model'

const markerCache = new WeakMap<Tree, Map<number, string>>()

export function markdownListNumbers(state: EditorState): Map<number, string> {
  const tree = readMarkdownDocumentTree(state)
  const cached = markerCache.get(tree)
  if (cached) {
    return cached
  }
  const markers = new Map<number, string>()
  tree.iterate({
    enter(node) {
      if (node.name !== 'OrderedList') {
        return
      }
      let number = 0
      for (const item of node.node.getChildren('ListItem')) {
        const mark = item.getChild('ListMark')
        if (!mark) {
          continue
        }
        const source = state.sliceDoc(mark.from, mark.to)
        if (!number) {
          number = Number.parseInt(source, 10)
        }
        markers.set(mark.from, `${number++}${source.at(-1)}`)
      }
    }
  })
  markerCache.set(tree, markers)
  return markers
}

function survivingMarker(
  transaction: Transaction,
  tree: Tree,
  item: SyntaxNode
): SyntaxNode | null {
  const mark = item.getChild('ListMark')
  if (!mark) {
    return null
  }
  const from = transaction.changes.mapPos(mark.from, 1)
  const to = transaction.changes.mapPos(mark.to, -1)
  if (
    to - from !== mark.to - mark.from ||
    transaction.newDoc.sliceString(from, to) !== transaction.startState.sliceDoc(mark.from, mark.to)
  ) {
    return null
  }
  const node = tree.resolveInner(from, 1)
  return node.name === 'ListMark' && node.from === from && node.to === to ? node : null
}

function deletedListNumberChanges(transaction: Transaction): ChangeSpec[] {
  const deleted: { from: number; to: number }[] = []
  transaction.changes.iterChangedRanges((from, to) => {
    if (from < to) {
      deleted.push({ from, to })
    }
  })
  if (!deleted.length) {
    return []
  }
  const before = readMarkdownDocumentTree(transaction.startState)
  const after = readMarkdownDocumentTree(transaction.state)
  const changes: ChangeSpec[] = []
  before.iterate({
    from: deleted[0].from,
    to: deleted.at(-1)!.to,
    enter(node) {
      if (
        node.name !== 'OrderedList' ||
        !deleted.some((range) => range.from <= node.to && range.to >= node.from)
      ) {
        return
      }
      const items = node.node.getChildren('ListItem')
      const numbers = items.map((item) =>
        Number.parseInt(transaction.startState.sliceDoc(item.from, item.to), 10)
      )
      // Preserve deliberately repeated or discontinuous source numbering.
      if (!numbers.every((number, index) => number === numbers[0] + index)) {
        return
      }
      const survivors = items.map((item) => survivingMarker(transaction, after, item))
      const parents = new Set(
        survivors.flatMap((mark) => {
          const list = mark?.parent?.parent
          return list?.name === 'OrderedList' ? [`${list.from}:${list.to}`] : []
        })
      )
      if (survivors.every(Boolean) || parents.size !== 1) {
        return
      }
      const list = survivors.find(Boolean)?.parent?.parent
      const remaining = list?.getChildren('ListItem') ?? []
      if (remaining.length >= items.length) {
        return
      }
      const ordinals = new Map(
        remaining.map((item, index) => [item.getChild('ListMark')?.from, numbers[0] + index])
      )
      for (let index = 0; index < items.length; index++) {
        const mark = survivors[index]
        const number = mark && ordinals.get(mark.from)
        if (mark && number !== undefined && number !== numbers[index]) {
          changes.push({
            from: mark.from,
            to: mark.to - 1,
            insert: String(number)
          })
        }
      }
    }
  })
  return changes
}

export const markdownListDeletionNumbering = EditorState.transactionFilter.of((transaction) => {
  if (
    !transaction.docChanged ||
    transaction.startState.readOnly ||
    transaction.startState.facet(markdownEditorMode) !== 'live' ||
    !(transaction.isUserEvent('delete') || transaction.isUserEvent('input'))
  ) {
    return transaction
  }
  const changes = deletedListNumberChanges(transaction)
  return changes.length ? [transaction, { changes, sequential: true }] : transaction
})
