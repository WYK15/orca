import { EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightSpecialChars } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { liveMarkdownKeymap } from './editor-commands'
import { revealedTableField } from './editor-context'
import { liveMarkdownDecorations } from './live-decorations'
import { imageInsertionAnchors } from './image-insertion-anchors'
import { tableCellSelection } from './table-cell-selection'
import { markdownSlashCompletion } from './slash-completion'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { copyMarkdownSource } from './markdown-copy-source'

export function markdownEditorExtensions(): Extension {
  return [
    history(),
    drawSelection(),
    highlightSpecialChars(),
    bracketMatching(),
    closeBrackets(),
    EditorState.languageData.of(() => [
      { closeBrackets: { brackets: ['(', '[', '{', '"', "'"], before: ')]}:;> ' } }
    ]),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: false }),
    revealedTableField,
    tableCellSelection,
    markdownSlashCompletion,
    liveMarkdownDecorations,
    imageInsertionAnchors,
    Prec.high(keymap.of(liveMarkdownKeymap)),
    keymap.of([
      { key: 'Mod-Shift-c', run: copyMarkdownSource },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap
    ]),
    search({ top: true }),
    highlightSelectionMatches(),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.keyword, class: 'live-md-token-keyword' },
        { tag: [tags.string, tags.regexp], class: 'live-md-token-string' },
        { tag: [tags.comment, tags.meta], class: 'live-md-token-comment' },
        { tag: [tags.number, tags.bool], class: 'live-md-token-number' }
      ])
    ),
    EditorState.phrases.of({
      Find: '查找',
      Replace: '替换',
      next: '下一个',
      previous: '上一个',
      all: '全部',
      replace: '替换',
      'replace all': '全部替换',
      'match case': '区分大小写',
      regexp: '正则表达式',
      'by word': '全字匹配',
      close: '关闭',
      'No matches': '无匹配',
      'Go to line': '跳转到行'
    })
  ]
}
