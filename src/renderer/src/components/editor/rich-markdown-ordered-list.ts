import OrderedList from '@tiptap/extension-ordered-list'

export const RichMarkdownOrderedList = OrderedList.extend({
  parseMarkdown(token, helpers) {
    // Ordered-list continuations need paragraph parsing to retain inline syntax and block images.
    const items = token.items?.map((item) => ({
      ...item,
      tokens: item.tokens?.map((child) =>
        child.type === 'text' && child.tokens?.length ? { ...child, type: 'paragraph' } : child
      )
    }))
    return OrderedList.config.parseMarkdown?.call(this, { ...token, items }, helpers) ?? []
  }
})
