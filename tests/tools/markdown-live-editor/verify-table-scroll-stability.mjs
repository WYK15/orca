import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const pause = () => page.waitForTimeout(150)
const top = () => page.evaluate(() => window.editor.scrollDOM.scrollTop)
const table = (prefix, rows = 8) =>
  [
    '| Item | Details | Boundary | Evidence |',
    '| --- | --- | --- | --- |',
    ...Array.from(
      { length: rows },
      (_, index) =>
        `| ${prefix} ${index + 1} | ${'A long explanation with wrapped text. '.repeat(7)} | ${'Preserve neighboring content. '.repeat(3)} | [source](./evidence.md) |`
    )
  ].join('\n')
const source = [
  '# Report',
  ...Array.from({ length: 5 }, (_, index) => `## Earlier ${index + 1}\n\n${table('Earlier', 4)}`),
  '### 6.1 Current section',
  'Clicking the first item must retain its visible position.',
  table('Current', 14),
  '### 6.2 Following section',
  'Following content must not become the scroll target.',
  table('Later', 4)
].join('\n\n')
const cell = () => page.locator('[data-table-cell="1:0"]').filter({ hasText: 'Current 1' })
const navigate = async () => {
  await page.evaluate(() => {
    window.editor.dispatch({
      selection: { anchor: window.editor.state.doc.toString().indexOf('### 6.1') },
      scrollIntoView: true
    })
  })
  await pause()
  await cell().scrollIntoViewIfNeeded()
  await pause()
}
const stable = async (action, label) => {
  const before = await top()
  await action()
  await pause()
  const after = await top()
  assert.ok(Math.abs(after - before) <= 2, `${label}: scroll moved ${after - before}px`)
}

try {
  for (const width of [1280, 900]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
    await page.locator('.cm-content').waitFor()
    const mod = await page.evaluate(() =>
      navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
    )
    await page.evaluate((text) => window.setDocument(text), source)
    await pause()
    await navigate()
    await stable(() => cell().click(), 'Entering the first cell')
    const input = page.getByRole('textbox', { name: '第 2 行第 1 列', exact: true })
    await input.waitFor()
    await stable(() => input.fill('Changed item'), 'Editing a table below earlier tables')
    assert.equal(
      await page.evaluate(() => window.raw),
      source.replace('Current 1 |', 'Changed item |')
    )
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await page.evaluate(() => window.raw), source)
    console.log(
      `PASS: ${width}px live table focus/edit/undo retains the viewport and original source`
    )
  }
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: `/tmp/orcaw-table-scroll-${browserName}-failure.png` })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
