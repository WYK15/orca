import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, webkit } from 'playwright'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const contextUrl = `/@fs${pathToFileURL(resolve('src/renderer/src/components/editor/live-markdown/editor-context.ts')).pathname}`
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const image = page.locator('.live-md-image img')
const raw = () => page.evaluate(() => window.raw)
const geometry = () =>
  image.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const content = window.editor.contentDOM
    const style = getComputedStyle(content)
    return {
      width: rect.width,
      height: rect.height,
      available:
        content.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight
    }
  })
const fit = async (width, height, label) => {
  const box = await geometry()
  const expected = Math.min(
    1,
    box.available / width,
    (await page.evaluate(() => innerHeight * 0.7)) / height
  )
  assert.ok(Math.abs(box.width - width * expected) < 2, `${label}: ${JSON.stringify(box)}`)
  assert.ok(Math.abs(box.height - height * expected) < 2, `${label}: image aspect ratio changed`)
  return box
}
const load = async (source, width = 4580, height = 1926) => {
  await page.evaluate((value) => window.setDocument(value), source)
  await page.waitForFunction((value) => window.editor.state.doc.toString() === value, source)
  await page.evaluate(
    async ({ url, width, height }) => {
      const module = await fetch(url).then((response) => response.text())
      const stateUrl = module.match(/from "([^"]*@codemirror_state[^"]*)"/)[1]
      const { StateEffect, Prec } = await import(stateUrl)
      const { markdownEditorContext } = await import(url)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="gray"/></svg>`
      window.imageLayoutSource = `data:image/svg+xml;base64,${btoa(svg)}`
      window.editor.dispatch({
        selection: { anchor: window.editor.state.doc.length },
        effects: StateEffect.appendConfig.of(
          Prec.highest(
            markdownEditorContext.of({
              version: `${width}:${height}`,
              loadImage: async () => {
                await new Promise((resolve) => setTimeout(resolve, 40))
                return window.imageLayoutSource
              },
              openLink: () => {}
            })
          )
        )
      })
    },
    { url: contextUrl, width, height }
  )
  await page.waitForFunction(() => {
    const element = document.querySelector('.live-md-image img')
    return element?.complete && element.naturalWidth > 0 && element.src === window.imageLayoutSource
  })
}
try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const source = '# Title\n\n![x](large.png)\n\nAfter -> &gt;'
  await load(source)
  await fit(4580, 1926, 'large image with a short caption')
  assert.equal(await raw(), source)
  console.log('PASS: a large image fits the editor width independently of its short caption')

  await page.setViewportSize({ width: 640, height: 800 })
  await page.waitForTimeout(100)
  await fit(4580, 1926, 'narrow editor')
  await page.getByRole('button', { name: '主题', exact: true }).click()
  await page.screenshot({ path: `/tmp/orcaw-image-layout-${browserName}-light.png` })
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  await fit(4580, 1926, 'reading mode')
  await page.getByRole('button', { name: 'source', exact: true }).click()
  assert.equal(await image.count(), 0)
  await page.getByRole('button', { name: 'live', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('.live-md-image img')?.src === window.imageLayoutSource
  )
  await fit(4580, 1926, 'restored live mode')
  await page.evaluate(() => window.editor.dispatch({ selection: { anchor: 11 } }))
  await fit(4580, 1926, 'active image source')
  assert.equal(await raw(), source)
  console.log(
    'PASS: narrow layouts, source reveal and all view modes retain sizing and exact source'
  )

  await page.setViewportSize({ width: 1280, height: 900 })
  const small = '![a much longer caption](small.png)\n\nend'
  await load(small, 32, 20)
  await fit(32, 20, 'small natural image')
  assert.equal(await raw(), small)
  const portrait = '![x](portrait.png)\n\nend'
  await load(portrait, 300, 1600)
  await fit(300, 1600, 'portrait image')
  assert.equal(await raw(), portrait)
  const inline = 'Before ![x](wide.png) after\n\nend'
  await load(inline)
  await fit(4580, 1926, 'inline image')
  assert.equal(await raw(), inline)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: small images keep natural size; portraits and inline images retain proportions; no browser exceptions'
  )
} catch (error) {
  await page.screenshot({ path: `/tmp/orcaw-image-layout-${browserName}-failure.png` })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
