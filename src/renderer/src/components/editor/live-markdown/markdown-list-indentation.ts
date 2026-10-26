import { countColumn, type ChangeSpec, type StateCommand } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import type { SyntaxNode } from '@lezer/common'
import { markdownCodeBlockAt } from './markdown-inline-format'
import { readMarkdownDocumentTree } from './markdown-document-model'
import { shiftMarkdownContainerIndent } from './markdown-container-prefix'
import { markdownEditorMode } from './editor-context'

export function indentMarkdownList(outdent: boolean): StateCommand {
  return ({ state, dispatch }) => {
    if (state.readOnly || markdownCodeBlockAt(state) || !state.selection.main.empty) {
      return false
    }
    const tree = readMarkdownDocumentTree(state)
    let item = tree.resolveInner(state.selection.main.head, -1)
    while (item.parent && item.name !== 'ListItem') {
      item = item.parent
    }
    const mark = item.name === 'ListItem' ? item.getChild('ListMark') : null
    if (!mark) {
      return false
    }
    let previous = item.prevSibling
    while (previous && previous.name !== 'ListItem') {
      previous = previous.prevSibling
    }
    const parent = item.parent?.parent
    const targetItem = outdent ? (parent?.name === 'ListItem' ? parent : null) : previous
    const targetMark = targetItem?.getChild('ListMark')
    if (!targetMark) {
      return true
    }
    const first = state.doc.lineAt(mark.from)
    const targetLine = state.doc.lineAt(targetMark.from)
    const spacing = outdent
      ? ''
      : (state.sliceDoc(targetMark.to, targetLine.to).match(/^[\t ]+/)?.[0] ?? ' ')
    const targetPrefix =
      state.sliceDoc(targetLine.from, outdent ? targetMark.from : targetMark.to) + spacing
    const delta =
      countColumn(targetPrefix, 4) - countColumn(state.sliceDoc(first.from, mark.from), 4)
    const changes: ChangeSpec[] = []
    for (let number = first.number; number <= state.doc.lineAt(item.to).number; number++) {
      const line = state.doc.line(number)
      const change = shiftMarkdownContainerIndent(state, line.from, delta)
      if (change) {
        changes.push(change)
      }
    }
    if (outdent && state.facet(markdownEditorMode) === 'live') {
      const currentMarker = state.sliceDoc(mark.from, mark.to)
      const parentMarker = state.sliceDoc(targetMark.from, targetMark.to)
      if (currentMarker.replace(/^\d+/, '') !== parentMarker.replace(/^\d+/, '')) {
        const insert = /^\d/.test(parentMarker)
          ? `${Number.parseInt(parentMarker, 10) + 1}${parentMarker.at(-1)}`
          : parentMarker
        changes.push({ from: mark.from, to: mark.to, insert })
        if (
          !/^\d/.test(parentMarker) &&
          item.parent?.name === 'OrderedList' &&
          !item.getChild('OrderedList')
        ) {
          let following = item.nextSibling
          while (following && following.name !== 'ListItem') {
            following = following.nextSibling
          }
          const followingMark = following?.getChild('ListMark')
          if (followingMark) {
            // A nested ordered list must start at one to interrupt a bullet paragraph.
            changes.push({ from: followingMark.from, to: followingMark.to - 1, insert: '1' })
          }
        }
      }
    }
    let changeSet = state.changes(changes)
    if (state.facet(markdownEditorMode) === 'live') {
      const nextState = state.update({ changes: changeSet, filter: false }).state
      const nextTree = readMarkdownDocumentTree(nextState)
      const lists = new Map<string, SyntaxNode>()
      let destination: SyntaxNode | null = null
      for (const sibling of item.parent?.getChildren('ListItem') ?? []) {
        const siblingMark = sibling.getChild('ListMark')
        if (!siblingMark) {
          continue
        }
        const movedMark = nextTree.resolveInner(changeSet.mapPos(siblingMark.to, -1), -1)
        const list = movedMark.name === 'ListMark' ? movedMark.parent?.parent : null
        if (list?.name === 'OrderedList') {
          lists.set(`${list.from}:${list.to}`, list)
          if (sibling.from === item.from) {
            destination = list
          }
        }
      }
      const renumber: ChangeSpec[] = []
      for (const list of lists.values()) {
        const entries = list.getChildren('ListItem')
        const firstMark = entries[0]?.getChild('ListMark')
        if (!firstMark) {
          continue
        }
        const oldFirst = tree.resolveInner(changeSet.invertedDesc.mapPos(firstMark.from, 1), 1)
        const oldList = oldFirst.name === 'ListMark' ? oldFirst.parent?.parent : null
        const oldStart = oldList?.getChild('ListItem')?.getChild('ListMark')
        const start =
          !outdent && list === destination && oldList?.from === item.parent?.from
            ? 1
            : Number.parseInt(
                oldStart
                  ? state.sliceDoc(oldStart.from, oldStart.to)
                  : nextState.sliceDoc(firstMark.from, firstMark.to),
                10
              )
        entries.forEach((entry, index) => {
          const entryMark = entry.getChild('ListMark')
          if (
            entryMark &&
            Number.parseInt(nextState.sliceDoc(entryMark.from, entryMark.to), 10) !== start + index
          ) {
            renumber.push({
              from: entryMark.from,
              to: entryMark.to - 1,
              insert: String(start + index)
            })
          }
        })
      }
      changeSet = changeSet.compose(nextState.changes(renumber))
    }
    dispatch(
      state.update({
        changes: changeSet,
        selection: state.selection.map(changeSet),
        userEvent: 'input',
        annotations: isolateHistory.of('full')
      })
    )
    return true
  }
}
