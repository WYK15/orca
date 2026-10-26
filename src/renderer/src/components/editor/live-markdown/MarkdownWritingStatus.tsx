import { useLayoutEffect, useState, type ReactNode } from 'react'
import { syntaxTree } from '@codemirror/language'
import { Compartment, StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { MarkdownWritingSettings } from './MarkdownWritingSettings'
import { markdownWritingStatistics } from './markdown-writing-statistics'
import type { MarkdownWritingPreferences } from './markdown-writing-preferences'

export function MarkdownWritingStatus({
  view,
  preferences,
  children
}: {
  view: EditorView | null
  preferences: MarkdownWritingPreferences
  children?: ReactNode
}) {
  const [status, setStatus] = useState({ words: 0, characters: 0, selected: 0, line: 1, column: 1 })
  useLayoutEffect(() => {
    if (!view) {
      return
    }
    let total = markdownWritingStatistics(view.state)
    const refresh = (): void => {
      const range = view.state.selection.main
      const line = view.state.doc.lineAt(range.head)
      setStatus({
        ...total,
        selected: range.empty
          ? 0
          : markdownWritingStatistics(view.state, range.from, range.to).words,
        line: line.number,
        column: range.head - line.from + 1
      })
    }
    refresh()
    const compartment = new Compartment()
    view.dispatch({
      effects: StateEffect.appendConfig.of(
        compartment.of(
          EditorView.updateListener.of((update) => {
            const parsed = syntaxTree(update.startState) !== syntaxTree(update.state)
            if (update.docChanged || parsed) {
              total = markdownWritingStatistics(update.state)
            }
            if (update.docChanged || update.selectionSet || parsed) {
              refresh()
            }
          })
        )
      )
    })
    return () => {
      if (view.dom.isConnected) {
        view.dispatch({ effects: compartment.reconfigure([]) })
      }
    }
  }, [view])
  return (
    <div className="live-md-writing-status">
      <span aria-label="文档字数">
        {status.selected ? `已选 ${status.selected} / ` : ''}
        {status.words} 字
      </span>
      <span className="hidden sm:inline" aria-label="文档字符数">
        {status.characters} 字符
      </span>
      <span className="hidden sm:inline">
        {status.line}:{status.column}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {children}
        <MarkdownWritingSettings preferences={preferences} />
      </div>
    </div>
  )
}
