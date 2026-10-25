import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

export type MarkdownSourceLink = {
  from: number
  to: number
  labelFrom: number
  labelTo: number
  href: string
}
const cache = new WeakMap<EditorState, { links: MarkdownSourceLink[]; definitions: string }>()
const labelKey = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase()
const destination = (value: string): string =>
  value.replace(/^<|>$/g, '').replace(/\\([\p{P}\p{S}])/gu, '$1')

function parseLinks(state: EditorState) {
  const known = cache.get(state)
  if (known) {
    return known
  }
  const definitions: string[] = []
  const references = new Map<string, string>()
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'LinkReference') {
        const label = node.node.getChild('LinkLabel')
        const url = node.node.getChild('URL')
        if (label && url) {
          const key = labelKey(state.sliceDoc(label.from + 1, label.to - 1))
          if (!references.has(key)) {
            references.set(key, destination(state.sliceDoc(url.from, url.to)))
            definitions.push(state.sliceDoc(node.from, node.to))
          }
        }
        return false
      }
      return node.name !== 'FencedCode' && node.name !== 'CodeBlock'
    }
  })
  const links: MarkdownSourceLink[] = []
  syntaxTree(state).iterate({
    enter(node) {
      if (['LinkReference', 'Image', 'FencedCode', 'CodeBlock'].includes(node.name)) {
        return false
      }
      if (node.name === 'Link') {
        const marks = node.node.getChildren('LinkMark')
        const opening = marks[0]
        const closing = marks.find((mark) => state.sliceDoc(mark.from, mark.to) === ']')
        const url = node.node.getChild('URL')
        const reference = node.node.getChild('LinkLabel')
        if (opening && closing) {
          const label = state.sliceDoc(opening.to, closing.from)
          const key = reference
            ? state.sliceDoc(reference.from + 1, reference.to - 1) || label
            : label
          const href = url
            ? destination(state.sliceDoc(url.from, url.to))
            : references.get(labelKey(key))
          if (href) {
            links.push({
              from: node.from,
              to: node.to,
              labelFrom: opening.to,
              labelTo: closing.from,
              href
            })
          }
        }
        return false
      }
      if (node.name === 'Autolink' || node.name === 'URL') {
        const url = node.name === 'Autolink' ? node.node.getChild('URL') : node.node
        if (url) {
          const text = destination(state.sliceDoc(url.from, url.to))
          const href = /^[\w.+-]+@[^\s/]+\.[^\s/]+$/.test(text)
            ? `mailto:${text}`
            : /^www\./i.test(text)
              ? `https://${text}`
              : text
          links.push({ from: node.from, to: node.to, labelFrom: url.from, labelTo: url.to, href })
        }
        return false
      }
      return undefined
    }
  })
  const parsed = { links, definitions: definitions.join('\n') }
  cache.set(state, parsed)
  return parsed
}

export const markdownSourceLinks = (state: EditorState): MarkdownSourceLink[] =>
  parseLinks(state).links
export const markdownLinkDefinitions = (state: EditorState): string => parseLinks(state).definitions

export function markdownLinkAt(
  state: EditorState,
  position: number
): MarkdownSourceLink | undefined {
  return markdownSourceLinks(state).find((link) => position >= link.from && position <= link.to)
}
