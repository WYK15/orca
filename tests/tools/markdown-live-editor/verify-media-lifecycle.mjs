import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, webkit } from 'playwright'
import { createDesktopImageFixture } from './desktop-image-fixture.mjs'

const fixture = await createDesktopImageFixture()
const browser = await (process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const contextUrl = `/@fs${pathToFileURL(resolve('src/renderer/src/components/editor/live-markdown/editor-context.ts')).pathname}`
const loaderUrl = `/@fs${pathToFileURL(resolve('src/renderer/src/components/editor/useLocalImageSrc.ts')).pathname}`
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
let version = 0
const raw = () => page.evaluate(() => window.raw)
const load = async (source) => {
  await page.evaluate((source) => window.setDocument(source), source)
  await page.waitForFunction((source) => window.editor.state.doc.toString() === source, source)
  await install()
}
const install = async () => {
  await page.evaluate(
    async ({ contextUrl, loaderUrl, documentPath, project, version }) => {
      const text = await fetch(contextUrl).then((response) => response.text())
      const stateUrl = text.match(/from "([^"]*@codemirror_state[^"]*)"/)[1]
      const { StateEffect, Prec, Compartment } = await import(stateUrl)
      const { markdownEditorContext } = await import(contextUrl)
      const { loadLocalImageSrc } = await import(loaderUrl)
      window.api = {
        fs: {
          readMarkdownImage: async (args) => {
            const response = await fetch('/__native-image', {
              method: 'POST',
              body: JSON.stringify(args)
            })
            const value = await response.json()
            if (!response.ok) {
              throw new Error(value.error)
            }
            return value
          }
        },
        export: {
          htmlToFile: async (payload) => {
            window.mediaExport = payload
            return { success: true }
          }
        }
      }
      const compartment = window.realMediaCompartment ?? new Compartment()
      const installed = compartment.get(window.editor.state) !== undefined
      window.realMediaCompartment = compartment
      const context = Prec.highest(
        markdownEditorContext.of({
          version: `real-media-${version}`,
          loadImage: (src) =>
            loadLocalImageSrc(src, documentPath, undefined, {
              settings: { activeRuntimeEnvironmentId: null },
              worktreeId: 'fixture',
              worktreePath: project,
              sourceMarkdownPath: documentPath
            }),
          openLink: () => {}
        })
      )
      window.editor.dispatch({
        selection: { anchor: window.editor.state.doc.length },
        effects: installed
          ? compartment.reconfigure(context)
          : StateEffect.appendConfig.of(compartment.of(context))
      })
    },
    {
      contextUrl,
      loaderUrl,
      documentPath: fixture.documentPath,
      project: fixture.project,
      version: ++version
    }
  )
}
try {
  await page.route('**/__native-image', async (route) => {
    try {
      const value = await fixture.call('fs:readMarkdownImage', [route.request().postDataJSON()])
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) })
    } catch (error) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: error.message })
      })
    }
  })
  const url = process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181'
  await page.goto(url)
  await page.locator('.cm-content').waitFor()
  await page.evaluate(async (url) => {
    await import(url)
  }, loaderUrl)
  await page.waitForTimeout(500)
  await page.reload()
  await page.locator('.cm-content').waitFor()
  const fileUrl = pathToFileURL(fixture.imagePath).href
  const source = `# Media\n\n![external](${fileUrl})\n\n![relative](./relative%20image.svg)\n\nend`
  await load(source)
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.live-md-image img')]
    return (
      images.length === 2 &&
      images.every(
        (image) => image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0
      )
    )
  })
  assert.deepEqual(
    await page
      .locator('.live-md-image img')
      .evaluateAll((images) => images.map((image) => image.naturalWidth)),
    [1, 200]
  )
  assert.equal(await raw(), source)
  await assert.rejects(
    fixture.call('fs:readFile', [{ filePath: fixture.imagePath }]),
    /Access denied/
  )
  console.log(
    'PASS: real backend reads absolute file URLs, spaces, parentheses, encoded hashes and relative SVG images without granting general file access'
  )

  await page.getByRole('button', { name: '导出文档', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出独立 HTML', exact: true }).click()
  await page.waitForFunction(() => !!window.mediaExport)
  const exported = await page.evaluate(() => window.mediaExport.html)
  assert.ok(exported.includes(fixture.png.toString('base64')))
  assert.doesNotMatch(exported, /src="blob:/)
  assert.equal(await raw(), source)
  console.log(
    'PASS: export embeds the actual PNG and SVG bytes from the backend without changing Markdown'
  )

  const missing = `![missing](${pathToFileURL(fixture.missingImage).href})\n\nend`
  await load(missing)
  await page.locator('.live-md-image-caption').filter({ hasText: '图片未找到' }).waitFor()
  await writeFile(fixture.missingImage, fixture.png)
  await page.evaluate(async (url) => {
    const { invalidateLocalImageSrcCacheForTests } = await import(url)
    invalidateLocalImageSrcCacheForTests()
  }, loaderUrl)
  await install()
  await page.waitForFunction(() => {
    const image = document.querySelector('.live-md-image img')
    return (
      image?.src.startsWith('blob:') && image.complete && image.naturalWidth === 1 && !image.hidden
    )
  })
  assert.equal(await raw(), missing)
  console.log(
    'PASS: a missing image can be created externally and retried without a cached failure or source rewrite'
  )

  const images = [
    `![caption][asset]\n\n[asset]: ${fileUrl}\n\nend`,
    `![asset][]\n\n[asset]: ${fileUrl}\n\nend`,
    `![asset]\n\n[asset]: ${fileUrl}\n\nend`,
    `![a \\] b](${fileUrl})\n\nend`
  ]
  for (const text of images) {
    await load(text)
    await page.waitForFunction(() =>
      document.querySelector('.live-md-image img')?.src.startsWith('blob:')
    )
    assert.equal(await raw(), text)
  }
  assert.equal(await page.locator('.live-md-image img').getAttribute('alt'), 'a ] b')
  const distant = `![asset][far]\n\n${'Paragraph.\n\n'.repeat(20000)}[far]: ${fileUrl}\n\nend`
  await load(distant)
  await page.waitForFunction(() =>
    document.querySelector('.live-md-image img')?.src.startsWith('blob:')
  )
  assert.equal(await raw(), distant)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: full, collapsed and shortcut image references plus escaped captions render real files and retain exact source'
  )
} finally {
  await browser.close()
  await fixture.close()
}
