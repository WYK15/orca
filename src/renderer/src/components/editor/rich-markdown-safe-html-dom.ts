import type {
  RichMarkdownSafeHtmlElement,
  RichMarkdownSafeHtmlFragment
} from './rich-markdown-safe-html-source'

export function createRichMarkdownSafeHtmlDom(
  fragment: RichMarkdownSafeHtmlFragment,
  ownerDocument: Document = document
): HTMLElement {
  return createElement(fragment.root, ownerDocument)
}

export function safeHtmlDomMatchesFragment(
  element: HTMLElement,
  fragment: RichMarkdownSafeHtmlFragment,
  allowedRootAttributes: readonly string[]
): boolean {
  const expected = createRichMarkdownSafeHtmlDom(fragment, element.ownerDocument)
  return elementsMatch(element, expected, new Set(allowedRootAttributes), true)
}

function createElement(node: RichMarkdownSafeHtmlElement, ownerDocument: Document): HTMLElement {
  const element = ownerDocument.createElement(node.tagName)
  for (const [name, value] of Object.entries(node.attributes)) {
    element.setAttribute(name, value)
  }
  for (const [property, value] of Object.entries(node.styles)) {
    element.style.setProperty(property, value)
  }
  for (const child of node.children) {
    element.append(
      child.type === 'text'
        ? ownerDocument.createTextNode(child.value)
        : createElement(child, ownerDocument)
    )
  }
  return element
}

function elementsMatch(
  actual: Element,
  expected: Element,
  allowedRootAttributes: ReadonlySet<string>,
  isRoot: boolean
): boolean {
  if (
    actual.tagName !== expected.tagName ||
    actual.childNodes.length !== expected.childNodes.length
  ) {
    return false
  }
  const expectedAttributes = new Map(
    Array.from(expected.attributes, (attribute) => [attribute.name, attribute.value])
  )
  for (const attribute of actual.attributes) {
    if (isRoot && allowedRootAttributes.has(attribute.name)) {
      continue
    }
    if (expectedAttributes.get(attribute.name) !== attribute.value) {
      return false
    }
    expectedAttributes.delete(attribute.name)
  }
  if (expectedAttributes.size > 0) {
    return false
  }
  return Array.from(actual.childNodes).every((actualChild, index) => {
    const expectedChild = expected.childNodes[index]
    if (actualChild.nodeType !== expectedChild.nodeType) {
      return false
    }
    if (actualChild.nodeType === Node.TEXT_NODE) {
      return actualChild.textContent === expectedChild.textContent
    }
    return (
      actualChild instanceof Element &&
      expectedChild instanceof Element &&
      elementsMatch(actualChild, expectedChild, allowedRootAttributes, false)
    )
  })
}
