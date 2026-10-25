import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { EditorView } from '@codemirror/view'
import { markdownEditorContext } from './editor-context'
import { navigateMarkdownAnchor } from './markdown-document-navigation'

const htmlTags = new Set(
  'a abbr address article aside b bdi bdo big blockquote br caption cite code col colgroup dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li main mark nav ol p picture pre q rp rt ruby s samp section small source span strong sub summary sup table tbody td tfoot th thead time tr u ul var wbr'.split(
    ' '
  )
)
const styleProperties = new Set(
  'color background-color font-size font-weight font-style text-decoration text-align vertical-align white-space width height max-width max-height zoom'.split(
    ' '
  )
)

export function safeMarkdownHtmlStyle(source: string): string {
  const element = document.createElement('span')
  element.style.cssText = source
  const allowed = document.createElement('span')
  for (let index = 0; index < element.style.length; index++) {
    const property = element.style.item(index)
    const value = element.style.getPropertyValue(property)
    if (
      styleProperties.has(property) &&
      !/url\s*\(|expression\s*\(|javascript:|@import/i.test(value)
    ) {
      allowed.style.setProperty(property, value)
    }
  }
  return allowed.style.cssText
}

export function canPreviewMarkdownHtml(source: string): boolean {
  const tags = Array.from(source.matchAll(/<\/?([a-z][\w.-]*)\b/gi), (match) =>
    match[1].toLowerCase()
  )
  return (
    tags.length > 0 &&
    tags.every((tag) => htmlTags.has(tag)) &&
    (/<(?:img|br|hr)\b/i.test(source) || !!source.replace(/<[^>]*>/g, '').trim())
  )
}

export function mountMarkdownHtmlPreview(
  host: HTMLElement,
  source: string,
  view: EditorView,
  inline: boolean
): () => void {
  let disposed = false
  const fragment = DOMPurify.sanitize(
    inline ? marked.parseInline(source, { async: false }) : source,
    {
      RETURN_DOM_FRAGMENT: true,
      FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['id', 'class', 'contenteditable', 'tabindex', 'srcset']
    }
  )
  for (const element of fragment.querySelectorAll<HTMLElement>('[style]')) {
    const style = safeMarkdownHtmlStyle(element.getAttribute('style') ?? '')
    element.removeAttribute('style')
    if (style) {
      element.setAttribute('style', style)
    }
  }
  for (const image of fragment.querySelectorAll('img')) {
    const path = image.getAttribute('src')
    image.removeAttribute('src')
    if (path) {
      void view.state
        .facet(markdownEditorContext)
        .loadImage(path)
        .then((url) => {
          if (!disposed && url) {
            image.src = url
            image.addEventListener(
              'load',
              () => {
                if (view.dom.isConnected) {
                  view.requestMeasure()
                }
              },
              { once: true }
            )
            if (view.dom.isConnected) {
              view.requestMeasure()
            }
          }
        })
        .catch(() => {
          if (!disposed) {
            image.alt ||= '图片未找到'
          }
        })
    }
  }
  host.append(fragment)
  host.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    const link = target?.closest('a')
    if (link) {
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (!navigateMarkdownAnchor(view, href)) {
        view.state.facet(markdownEditorContext).openLink(href)
      }
    }
  })
  return () => {
    disposed = true
  }
}
