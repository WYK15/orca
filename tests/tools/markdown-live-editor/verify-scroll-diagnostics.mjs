import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1082, height: 950 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = {}
  window.scrollReports = []
  window.api = {
    diagnostics: {
      recordMarkdownScrollTrace: async (trace) => {
        window.scrollReports.push(JSON.parse(trace))
      }
    }
  }
})
const secret = 'PRIVATE_MARKDOWN_CONTENT_DO_NOT_LOG'
const source = `# Report\n\n${secret}\n\n${Array.from(
  { length: 100 },
  (_, index) => `Paragraph ${index}.`
).join('\n\n')}`
try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4193')
  await page.locator('.cm-content').waitFor()
  await page.evaluate((text) => window.setDocument(text), source)
  await page.waitForTimeout(200)
  await page.evaluate(() => window.editor.focus())
  await page.mouse.move(650, 400)
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    window.editor.scrollDOM.scrollTop = 0
  })
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    const view = window.editor
    view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true })
  })
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    const view = window.editor
    view.dispatch({ effects: view.constructor.scrollIntoView(0, { y: 'start' }) })
  })
  await page.evaluate(() => window.editor.setState(window.editor.state))
  await page.waitForTimeout(450)
  const reports = await page.evaluate(() => window.scrollReports)
  const entries = reports.flatMap((report) => report.entries)
  for (const event of [
    'mount',
    'wheel',
    'scroll',
    'backward-scroll',
    'scrollTop.write',
    'content.focus',
    'update',
    'state.replace',
    'dispose'
  ]) {
    assert.ok(
      entries.some((entry) => entry.event === event),
      `Missing ${event} trace`
    )
  }
  assert.ok(
    entries.some(
      (entry) =>
        entry.event === 'update' &&
        entry.detail.transactions.some((transaction) => transaction.scrollIntoView)
    )
  )
  assert.ok(
    entries.some(
      (entry) =>
        entry.event === 'update' &&
        entry.detail.transactions.some((transaction) =>
          transaction.scrollEffects.some((effect) => effect.from === 0 && effect.y === 'start')
        )
    )
  )
  assert.ok(entries.some((entry) => entry.event === 'scrollTop.write' && entry.detail.stack))
  assert.ok(!JSON.stringify(reports).includes(secret), 'Diagnostics must not include document text')
  assert.ok(reports.every((report) => report.schema === 1 && report.entries.length <= 200))
  assert.equal(await page.evaluate(() => window.raw), source)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: wheel direction, backward scrolling, focus, state resets and scroll requests are logged without document text'
  )
} finally {
  await browser.close()
}
