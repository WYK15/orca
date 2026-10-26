import katexCss from 'katex/dist/katex.min.css?raw'

const files = import.meta.glob<string>('../../../../../../node_modules/katex/dist/fonts/*.woff2', {
  eager: true,
  query: '?url',
  import: 'default'
})
let embedded: Promise<string> | undefined
export async function exportAssetDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('无法读取导出资源')
  }
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('无法嵌入导出资源'))
    reader.readAsDataURL(blob)
  })
}

export function markdownExportFontCss(): Promise<string> {
  embedded ??= Promise.all(
    Object.entries(files).map(
      async ([path, url]) => [path.split('/').pop()!, await exportAssetDataUrl(url)] as const
    )
  )
    .then((fonts) => {
      const urls = new Map(fonts)
      return katexCss.replace(
        /src:url\(fonts\/([^)]*\.woff2)\)[^;]*;/g,
        (_, name: string) => `src:url(${urls.get(name) ?? ''}) format("woff2");`
      )
    })
    .catch((error) => {
      embedded = undefined
      throw error
    })
  return embedded
}
