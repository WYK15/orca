import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium, webkit } from 'playwright'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1218, height: 1059 } })
const fixture = process.env.ORCA_MARKDOWN_SCROLL_FIXTURE
const source = fixture
  ? readFileSync(fixture, 'utf8')
  : `# Scroll report\n\n${Array.from({ length: 100 }, (_, index) => `Paragraph ${index}.`).join('\n\n')}`
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4193')
  await page.locator('.cm-content').waitFor()
  await page.evaluate((text) => window.setDocument(text), source)
  await page.evaluate(() => document.fonts.ready)
  const layout = page.locator('.live-markdown-layout')
  assert.equal(
    await layout.evaluate((element) => getComputedStyle(element).containerType),
    'normal'
  )
  await page.evaluate(() => {
    const view = window.editor
    window.positions = []
    view.scrollDOM.addEventListener('scroll', () => window.positions.push(view.scrollDOM.scrollTop))
  })
  await page.getByRole('button', { name: 'live', exact: true }).focus()
  await page.mouse.move(800, 400)
  for (let burst = 0; burst < 6; burst++) {
    for (const delta of [4, 40, 167, 231, 264, 290, 310]) {
      await page.mouse.wheel(0, delta)
    }
    await page.waitForTimeout(100)
  }
  const positions = await page.evaluate(() => window.positions)
  assert.ok(Math.max(...positions) > 1000, 'Wheel input must move through the document')
  assert.ok(
    positions.every((top, index) => !index || top >= positions[index - 1] - 3),
    `Downward scrolling moved backward: ${JSON.stringify(positions)}`
  )
  await page.getByRole('button', { name: '目录', exact: true }).click()
  const toc = page.getByRole('complementary', { name: '文档目录' })
  for (const [width, narrow] of [
    [900, false],
    [500, true],
    [900, false]
  ]) {
    await layout.evaluate((element, size) => {
      element.style.width = `${size}px`
    }, width)
    await page.waitForFunction(
      (value) => document.querySelector('.live-markdown-layout').dataset.narrow === String(value),
      narrow
    )
    assert.equal(
      await toc.evaluate((element) => getComputedStyle(element).position),
      narrow ? 'absolute' : 'relative'
    )
    const bounds = await page.evaluate(() => ({
      layout: document.querySelector('.live-markdown-layout').getBoundingClientRect().left,
      editor: document.querySelector('.live-markdown-editor').getBoundingClientRect().left,
      toc: document.querySelector('.markdown-toc-panel').getBoundingClientRect().width
    }))
    assert.ok(
      Math.abs(bounds.editor - bounds.layout - (narrow ? 0 : bounds.toc)) < 2,
      'A narrow outline must overlay the document; a wide outline must reserve its column'
    )
  }
  assert.equal(await page.evaluate(() => window.raw), source)
  if (fixture) {
    assert.equal(readFileSync(fixture, 'utf8'), source)
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: production layout avoids query containment, retains downward scroll and overlays the outline only in narrow panes'
  )
} finally {
  await browser.close()
}
