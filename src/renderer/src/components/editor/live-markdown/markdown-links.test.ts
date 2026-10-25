import { expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { markdownSourceLinks } from './markdown-links'

function links(doc: string) {
  return markdownSourceLinks(
    EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  )
}

it('resolves inline links with encoded paths and optional titles', () => {
  expect(links('[title](<./file name.md> "description")')[0].href).toBe('./file name.md')
})

it('resolves reference, collapsed and implicit links using the first definition', () => {
  const parsed = links(
    '[one][ID]\n\n[two][]\n\n[three]\n\n[id]: https://one.test\n[two]: ./two.md\n[three]: #anchor\n[id]: https://ignored.test'
  )
  expect(parsed.map((link) => link.href)).toEqual(['https://one.test', './two.md', '#anchor'])
})

it('handles bare URLs, bracketed URLs, www links and email autolinks', () => {
  expect(
    links('https://a.test <https://b.test> www.c.test <a@example.com>').map((link) => link.href)
  ).toEqual(['https://a.test', 'https://b.test', 'https://www.c.test', 'mailto:a@example.com'])
})

it('never opens code, image destinations or link definitions as visible links', () => {
  expect(
    links(
      '`https://code.test`\n\n```\nhttps://code.test\n```\n\n![image](https://image.test)\n\n[id]: https://reference.test'
    )
  ).toEqual([])
})
