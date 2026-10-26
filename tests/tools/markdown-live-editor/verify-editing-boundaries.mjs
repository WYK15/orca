import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const pause = () => page.waitForTimeout(100)
const raw = () => page.evaluate(() => window.raw)
const load = async (source) => {
  await page.evaluate((value) => window.setDocument(value), source)
  await pause()
}
const select = async (anchor, head = anchor) => {
  await page.evaluate(
    (selection) => {
      window.editor.dispatch({ selection })
      window.editor.focus()
    },
    { anchor, head }
  )
  await pause()
}
const mode = async (name) => {
  await page.getByRole('button', { name, exact: true }).click()
  await pause()
}
try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const mod = await page.evaluate(() => (navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'))
  const source = '[label](old.md)\n\nBefore -> &gt;'
  await load(source)
  await select(source.length)
  await page.keyboard.type('x')
  await select(3)
  await page.keyboard.press(`${mod}+k`)
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '应用', exact: true }).click()
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), source)
  console.log('PASS: applying unchanged link fields creates no extra undo step')

  await select(source.length)
  await page.keyboard.type(' draft')
  await select(3)
  await page.keyboard.press(`${mod}+k`)
  await page.getByLabel('链接地址', { exact: true }).fill('must-not-apply.md')
  await page
    .getByRole('button', { name: '另一份文档', exact: true, includeHidden: true })
    .evaluate((button) => button.click())
  await page.waitForFunction(() => window.raw === 'Other document')
  assert.equal(await page.getByRole('dialog').count(), 0)
  await select(3)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), 'Other document')
  await page.getByRole('button', { name: '另一份文档', exact: true }).click()
  assert.equal(await raw(), `${source} draft`)
  await select((await raw()).length)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), source)
  console.log(
    'PASS: switching files closes resource dialogs, protects the next file and retains the original draft/history'
  )

  const old = '# Old\r\n\r\nBefore -> &gt;\n\nend'
  await load(old)
  await select(old.replaceAll('\r\n', '\n').length)
  await page.keyboard.type(' draft')
  const replacement = '# External\r\n\r\nUnrelated -> &gt;\n\nend'
  await load(replacement)
  await select(replacement.replaceAll('\r\n', '\n').length)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), replacement)
  await page.keyboard.type(' new')
  assert.equal(await raw(), `${replacement} new`)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), replacement)
  console.log(
    'PASS: an external reload resets stale history and subsequent undo retains exact mixed line endings'
  )

  const readOnly =
    '# Read only\n\nText **bold** and `code`.\n\n| A | B |\n| --- | --- |\n| one | two |\n\nend'
  await load(readOnly)
  await mode('preview')
  await select(15, 30)
  await page.keyboard.press('Backspace')
  await page.locator('.cm-content').evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', '<h1>Must not insert</h1>')
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
    )
    element.dispatchEvent(
      new ClipboardEvent('cut', { clipboardData, bubbles: true, cancelable: true })
    )
  })
  assert.equal(await raw(), readOnly)
  assert.equal(
    await page.locator('.live-md-toolbar,.live-md-table-toolbar,.live-md-row-grip').count(),
    0
  )
  await mode('live')
  assert.equal(await raw(), readOnly)
  console.log(
    'PASS: reading mode rejects typing, HTML paste and cut without leaking editing controls or changing source'
  )

  for (const block of ['```text\ninside\n```', '---\ntitle: inside\n---', '$$\ninside\n$$']) {
    await load(`${block}\n\nend`)
    await select(block.indexOf('inside') + 3)
    await page.keyboard.press(`${mod}+k`)
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await raw(), `${block}\n\nend`)
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: link shortcuts inside code, metadata and math preserve literal content; no browser exceptions'
  )
} catch (error) {
  await page.screenshot({ path: `/tmp/orcaw-markdown-boundaries-${browserName}-failure.png` })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
