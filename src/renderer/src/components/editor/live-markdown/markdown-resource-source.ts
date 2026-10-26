import type { EditorState, TransactionSpec } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { isolateHistory } from '@codemirror/commands'
import type { SyntaxNode } from '@lezer/common'
import { markdownSourceLinks } from './markdown-links'
import {
  readImageAttribute,
  setImageAttribute,
  escapeImageAttribute
} from './markdown-image-attributes'

type SourceRange = { from: number; to: number }
export type MarkdownResourceDraft = {
  label: string
  href: string
  title: string
  width: string
  height: string
}
export type MarkdownResource = SourceRange &
  MarkdownResourceDraft & {
    kind: 'link' | 'image'
    source: string
    syntax: 'inline' | 'reference' | 'html' | 'new'
    labelRange?: SourceRange
    urlRange?: SourceRange
    titleRange?: SourceRange
  }
const decodeDestination = (value: string): string =>
  value.replace(/^<|>$/g, '').replace(/\\([\p{P}\p{S}])/gu, '$1')
const labelKey = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase()
const escapeLabel = (value: string): string => value.replace(/(?<!\\)([[\]])/g, '\\$1')
const escapeDestination = (value: string): string =>
  value.replace(/[\s<>()]/g, (character) =>
    character === '(' ? '%28' : character === ')' ? '%29' : encodeURIComponent(character)
  )

export function readMarkdownResource(
  state: EditorState,
  position: number
): MarkdownResource | null {
  const names = ['Image', 'Link', 'Autolink', 'URL', 'HTMLBlock', 'InlineHtml']
  const find = (bias: -1 | 1): SyntaxNode => {
    let node = syntaxTree(state).resolveInner(position, bias)
    while (node.parent && !names.includes(node.name)) {
      node = node.parent
    }
    return node
  }
  const after = find(1)
  const node = names.includes(after.name) ? after : find(-1)
  const source = state.sliceDoc(node.from, node.to)
  if (node.name === 'HTMLBlock' || node.name === 'InlineHtml') {
    const images = Array.from(source.matchAll(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi))
    const match =
      images.find(
        (image) =>
          position >= node.from + image.index! &&
          position <= node.from + image.index! + image[0].length
      ) ?? images[0]
    return match
      ? {
          kind: 'image',
          syntax: 'html',
          from: node.from + match.index!,
          to: node.from + match.index! + match[0].length,
          source: match[0],
          label: readImageAttribute(match[0], 'alt'),
          href: readImageAttribute(match[0], 'src'),
          title: readImageAttribute(match[0], 'title'),
          width: readImageAttribute(match[0], 'width'),
          height: readImageAttribute(match[0], 'height')
        }
      : null
  }
  if (!['Image', 'Link', 'Autolink', 'URL'].includes(node.name)) {
    return null
  }
  const kind = node.name === 'Image' ? 'image' : 'link'
  const marks = node.getChildren('LinkMark')
  const opening = marks[0]
  const closing = marks.find((mark) => state.sliceDoc(mark.from, mark.to) === ']')
  let url = node.getChild('URL') ?? (node.name === 'URL' ? node : null)
  let title = node.getChild('LinkTitle')
  const labelRange = opening && closing ? { from: opening.to, to: closing.from } : undefined
  const label = labelRange
    ? state.sliceDoc(labelRange.from, labelRange.to)
    : source.replace(/^<|>$/g, '')
  if (!url && labelRange) {
    const reference = node.getChild('LinkLabel')
    const key = labelKey(
      reference ? state.sliceDoc(reference.from + 1, reference.to - 1) || label : label
    )
    syntaxTree(state).iterate({
      enter(candidate) {
        if (candidate.name === 'LinkReference' && !url) {
          const name = candidate.node.getChild('LinkLabel')
          if (name && labelKey(state.sliceDoc(name.from + 1, name.to - 1)) === key) {
            url = candidate.node.getChild('URL')
            title = candidate.node.getChild('LinkTitle')
          }
          return false
        }
        return undefined
      }
    })
  }
  const inline = url && url.from >= node.from && url.to <= node.to && labelRange
  return {
    kind,
    from: node.from,
    to: node.to,
    source,
    syntax: inline ? 'inline' : 'reference',
    label,
    labelRange,
    urlRange: inline && url ? { from: url.from, to: url.to } : undefined,
    titleRange: inline && title ? { from: title.from, to: title.to } : undefined,
    href: url
      ? decodeDestination(state.sliceDoc(url.from, url.to))
      : (markdownSourceLinks(state).find((link) => link.from === node.from)?.href ?? ''),
    title: title ? state.sliceDoc(title.from + 1, title.to - 1) : '',
    width: '',
    height: ''
  }
}

export function newMarkdownLink(state: EditorState): MarkdownResource {
  const range = state.selection.main
  return {
    kind: 'link',
    syntax: 'new',
    from: range.from,
    to: range.to,
    source: state.sliceDoc(range.from, range.to),
    label: state.sliceDoc(range.from, range.to),
    href: 'https://',
    title: '',
    width: '',
    height: ''
  }
}

export function resourceSource(resource: MarkdownResource, draft: MarkdownResourceDraft): string {
  if (resource.kind === 'image' && (resource.syntax === 'html' || draft.width || draft.height)) {
    let source =
      resource.syntax === 'html'
        ? resource.source
        : `<img src="${escapeImageAttribute(resource.href)}" alt="${escapeImageAttribute(resource.label)}"${resource.title ? ` title="${escapeImageAttribute(resource.title)}"` : ''}>`
    for (const [attribute, value, original] of [
      ['src', draft.href, resource.href],
      ['alt', draft.label, resource.label],
      ['title', draft.title, resource.title],
      ['width', draft.width, resource.syntax === 'html' ? resource.width : ''],
      ['height', draft.height, resource.syntax === 'html' ? resource.height : '']
    ]) {
      if (value !== original) {
        source = setImageAttribute(source, attribute, value)
      }
    }
    return source
  }
  if (resource.syntax === 'inline' && resource.labelRange && resource.urlRange) {
    const edits: (SourceRange & { insert: string })[] = []
    if (draft.label !== resource.label) {
      edits.push({ ...resource.labelRange, insert: escapeLabel(draft.label) })
    }
    if (draft.href !== resource.href) {
      edits.push({ ...resource.urlRange, insert: escapeDestination(draft.href) })
    }
    if (draft.title !== resource.title) {
      const range = resource.titleRange
      edits.push(
        range
          ? {
              from: range.from - (draft.title ? 0 : 1),
              to: range.to,
              insert: draft.title ? `"${draft.title.replace(/["\\]/g, '\\$&')}"` : ''
            }
          : {
              from: resource.to - 1,
              to: resource.to - 1,
              insert: draft.title ? ` "${draft.title.replace(/["\\]/g, '\\$&')}"` : ''
            }
      )
    }
    return edits
      .sort((a, b) => b.from - a.from)
      .reduce(
        (source, edit) =>
          `${source.slice(0, edit.from - resource.from)}${edit.insert}${source.slice(edit.to - resource.from)}`,
        resource.source
      )
  }
  if (
    resource.syntax !== 'new' &&
    draft.label === resource.label &&
    draft.href === resource.href &&
    draft.title === resource.title
  ) {
    return resource.source
  }
  return `${resource.kind === 'image' ? '!' : ''}[${escapeLabel(draft.label || draft.href)}](${escapeDestination(draft.href)}${draft.title ? ` "${draft.title.replace(/["\\]/g, '\\$&')}"` : ''})`
}

export function resourceEditTransaction(
  state: EditorState,
  resource: MarkdownResource,
  draft: MarkdownResourceDraft | null
): TransactionSpec | null {
  if (state.readOnly || state.sliceDoc(resource.from, resource.to) !== resource.source) {
    return null
  }
  const insert = draft
    ? resourceSource(resource, draft)
    : resource.kind === 'link'
      ? resource.label
      : ''
  if (insert === resource.source) {
    return { selection: { anchor: resource.from + insert.length }, scrollIntoView: true }
  }
  return {
    changes: { from: resource.from, to: resource.to, insert },
    selection: { anchor: resource.from + insert.length },
    userEvent: 'input',
    annotations: isolateHistory.of('full'),
    scrollIntoView: true
  }
}
