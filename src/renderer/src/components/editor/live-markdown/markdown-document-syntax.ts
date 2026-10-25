import type { MarkdownExtension } from '@lezer/markdown'
import { markdownFrontmatterSyntax } from './markdown-frontmatter-syntax'
import { markdownMathSyntax } from './markdown-math-syntax'
import { markdownFootnoteSyntax } from './markdown-footnote-syntax'
import { markdownInlineHtmlSyntax } from './markdown-inline-html-syntax'

export const markdownDocumentSyntax: MarkdownExtension = [
  markdownFrontmatterSyntax,
  markdownMathSyntax,
  markdownFootnoteSyntax,
  markdownInlineHtmlSyntax
]
