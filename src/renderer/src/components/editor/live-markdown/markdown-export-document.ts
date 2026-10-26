import type { EditorView } from '@codemirror/view'
import { buildMarkdownExportHtml } from '../markdown-export-html'
import { markdownExportMarkup } from './markdown-export-markup'
import { markdownEditorContext } from './editor-context'
import { markdownExportFontCss, exportAssetDataUrl } from './markdown-export-fonts'

export async function markdownExportDocument(
  view: EditorView,
  title: string
): Promise<{ html: string; title: string }> {
  const snapshot = view.state
  const context = snapshot.facet(markdownEditorContext)
  const host = document.createElement('div')
  host.innerHTML = markdownExportMarkup(snapshot)
  await Promise.all(
    Array.from(host.querySelectorAll('img')).map(async (image) => {
      const source = image.getAttribute('src')
      if (!source) {
        return
      }
      const resolved = await context.loadImage(source)
      if (!resolved) {
        throw new Error(`无法导出图片：${source}`)
      }
      image.src = resolved.startsWith('data:') ? resolved : await exportAssetDataUrl(resolved)
      image.removeAttribute('loading')
    })
  )
  const diagrams = Array.from(host.querySelectorAll<HTMLElement>('code.language-mermaid'))
  if (diagrams.length) {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' })
    for (const code of diagrams) {
      try {
        const { svg } = await mermaid.render(
          `markdown-export-${crypto.randomUUID()}`,
          code.textContent ?? ''
        )
        const container = document.createElement('div')
        container.innerHTML = svg
        code.closest('pre')?.replaceWith(container)
      } catch {
        /* Keep invalid diagrams as readable code. */
      }
    }
  }
  const css = host.querySelector('.katex') ? await markdownExportFontCss() : ''
  const html = buildMarkdownExportHtml({ title, renderedHtml: host.innerHTML }).replace(
    '</head>',
    `<style>${css}\n.markdown-toc ol{list-style:none;padding-left:0}.markdown-footnotes{font-size:0.9em}.katex-display{overflow-x:auto}</style></head>`
  )
  return { html, title }
}
