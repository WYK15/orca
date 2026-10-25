import {
  autocompletion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'

const blocks = [
  { label: '标题 1', detail: '#', apply: '# ' },
  { label: '标题 2', detail: '##', apply: '## ' },
  { label: '标题 3', detail: '###', apply: '### ' },
  { label: '无序列表', detail: '-', apply: '- ' },
  { label: '有序列表', detail: '1.', apply: '1. ' },
  { label: '任务列表', detail: '[ ]', apply: '- [ ] ' },
  { label: '引用', detail: '>', apply: '> ' },
  { label: '代码块', detail: '```', apply: '```\n\n```', cursor: 4 },
  { label: '表格', detail: '2 × 2', apply: '| 列 1 | 列 2 |\n| --- | --- |\n|  |  |' },
  { label: '数学公式', detail: '$$', apply: '$$\n\n$$', cursor: 3 },
  {
    label: 'Mermaid 图表',
    detail: 'mermaid',
    apply: '```mermaid\ngraph TD\n  A --> B\n```',
    cursor: 11
  },
  { label: '分隔线', detail: '---', apply: '---\n' }
]

function completeMarkdownBlock(context: CompletionContext): CompletionResult | null {
  if (context.state.readOnly) {
    return null
  }
  const match = context.matchBefore(/\/[^\s/]*$/)
  if (!match) {
    return null
  }
  const line = context.state.doc.lineAt(match.from)
  if (!/^\s*$/.test(context.state.sliceDoc(line.from, match.from))) {
    return null
  }
  let node = syntaxTree(context.state).resolveInner(match.from, -1)
  while (node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
      return null
    }
    node = node.parent
  }
  return {
    from: match.from,
    filter: false,
    options: blocks
      .filter(
        (block) =>
          !match.text.slice(1) ||
          block.label.toLowerCase().includes(match.text.slice(1).toLowerCase())
      )
      .map((block) => ({
        label: block.label,
        detail: block.detail,
        apply(view, _completion, from, to) {
          const line = view.state.doc.lineAt(from)
          const indent = view.state.sliceDoc(line.from, from)
          const insert = block.apply.replace(/\n/g, `\n${indent}`)
          const cursor = block.cursor ?? block.apply.length
          const precedingLines = block.apply.slice(0, cursor).split('\n').length - 1
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + cursor + precedingLines * indent.length },
            userEvent: 'input'
          })
        }
      }))
  }
}

export const markdownSlashCompletion = autocompletion({
  override: [completeMarkdownBlock],
  activateOnTyping: true,
  defaultKeymap: true
})
