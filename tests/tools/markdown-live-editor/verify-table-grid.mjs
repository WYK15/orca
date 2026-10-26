import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const browser = await (process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const pause = () => page.waitForTimeout(100)
const raw = () => page.evaluate(() => window.raw)
const doc = async (source) => {
  await page.evaluate((value) => window.setDocument(value), source)
  await pause()
}
const cell = (row, column) => page.locator(`[data-table-cell="${row}:${column}"]`)
const selected = () => page.locator('[data-source-selected="true"]').count()
const copy = async (type = 'copy', content = {}) =>
  page.locator('.live-md-table').evaluate(
    (element, args) => {
      const clipboardData = new DataTransfer()
      for (const [key, value] of Object.entries(args.content)) {
        clipboardData.setData(key, value)
      }
      element.dispatchEvent(
        new ClipboardEvent(args.type, { clipboardData, bubbles: true, cancelable: true })
      )
      return { text: clipboardData.getData('text/plain'), html: clipboardData.getData('text/html') }
    },
    { type, content }
  )
const drag = async (axis, from, to) => {
  const prefix = axis === 'row' ? '行' : '列'
  const source = page.getByRole('button', { name: `移动第 ${from + 1} ${prefix}`, exact: true })
  const target = page.getByRole('button', { name: `移动第 ${to + 1} ${prefix}`, exact: true })
  const a = await source.boundingBox(),
    b = await target.boundingBox()
  assert.ok(a && b)
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })
  await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2 + 1)
  await page.waitForTimeout(120)
  await page.mouse.up()
  await pause()
}
try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const mod = await page.evaluate(() => (navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'))
  const source =
    'Before ->\r\n\r\n| A | B | C |\r\n| :--- | ---: | --- |\r\n| one | two | three |\r\n| four | five | six |\n\nAfter &gt;'
  await doc(source)
  await cell(1, 0).click()
  await cell(2, 1).click({ modifiers: ['Shift'] })
  assert.equal(await selected(), 4)
  const copied = await copy()
  assert.equal(copied.text, 'one\ttwo\nfour\tfive')
  assert.match(copied.html, /<table><tbody>/)
  assert.match(copied.html, /<td><p>five<\/p>/)
  await page.keyboard.press('Backspace')
  assert.match(await raw(), /\|  \|  \| three \|/)
  assert.match(await raw(), /\|  \|  \| six \|/)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), source)
  console.log(
    'PASS: Shift-click rectangle copy and clear preserve neighboring cells and exact undo'
  )

  await cell(1, 0).click()
  await cell(2, 1).click({ modifiers: ['Shift'] })
  await copy('paste', { 'text/plain': 'Filled' })
  await pause()
  assert.equal((await raw()).match(/Filled/g)?.length, 4)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), source)
  await cell(1, 0).click()
  await cell(2, 1).click({ modifiers: ['Shift'] })
  await copy('paste', { 'text/plain': 'x\ty\nz\tw' })
  await pause()
  assert.match(await raw(), /\| x \| y \| three \|/)
  assert.match(await raw(), /\| z \| w \| six \|/)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), source)
  console.log('PASS: rectangular fill and spreadsheet paste are each one reversible edit')

  await cell(1, 0).click()
  await cell(1, 1).click({ modifiers: ['Shift'] })
  await page.keyboard.press('Shift+ArrowDown')
  assert.equal(await selected(), 4)
  await page.keyboard.press(`${mod}+a`)
  assert.equal(await selected(), 9)
  await page.keyboard.press('Escape')
  assert.equal(await selected(), 0)
  assert.equal(await raw(), source)
  await page.getByRole('button', { name: '移动第 2 行', exact: true }).click()
  assert.equal(await selected(), 3)
  await page.getByRole('button', { name: '移动第 2 列', exact: true }).click()
  assert.equal(await selected(), 3)
  await page.keyboard.press('Escape')
  const start = await cell(1, 0).boundingBox(),
    end = await cell(2, 1).boundingBox()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 })
  await page.mouse.up()
  await pause()
  assert.equal(await selected(), 4)
  assert.equal(await raw(), source)
  console.log(
    'PASS: keyboard expansion, select-all, row/column handles and pointer rectangle selection'
  )

  await page.keyboard.press('Escape')
  await drag('row', 2, 1)
  assert.equal(
    await raw(),
    source.replace(
      '| one | two | three |\r\n| four | five | six |',
      '| four | five | six |\r\n| one | two | three |'
    )
  )
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), source)
  await drag('column', 0, 2)
  assert.match(await raw(), /\| B \| C \| A \|/)
  assert.match(await raw(), /\| ---: \| --- \| :--- \|/)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), source)
  console.log('PASS: native pointer drag reorders rows/columns with alignment and exact undo')

  await doc('New\n\n')
  await page.evaluate(() => {
    window.editor.dispatch({ selection: { anchor: window.editor.state.doc.length } })
    window.editor.focus()
  })
  await page.getByRole('button', { name: '表格', exact: true }).click()
  const cells = page.getByRole('gridcell')
  assert.equal(await cells.count(), 100)
  await cells.nth(12).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.locator('.live-md-table').waitFor()
  assert.equal(await page.locator('.live-md-table tr').count(), 4)
  assert.equal(await page.locator('.live-md-table th').count(), 4)
  console.log('PASS: keyboard table-size picker inserts chosen dimensions')
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  assert.equal(
    await page.locator('.live-md-row-grip,.live-md-column-grip,.live-md-cell-input').count(),
    0
  )
  assert.deepEqual(errors, [])
  console.log('PASS: reading mode has no editing handles or browser exceptions')
} catch (error) {
  await page.screenshot({ path: '/tmp/orcaw-markdown-grid-failure.png' })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
