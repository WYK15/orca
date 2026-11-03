import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
const results = []
const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const luminance = (rgb) =>
  rgb.reduce((sum, channel, index) => {
    const value = channel / 255
    return (
      sum +
      [0.2126, 0.7152, 0.0722][index] *
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    )
  }, 0)
{
  const name = browserName,
    engine = name === 'webkit' ? webkit : chromium
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chrome' ? { channel: 'chrome' } : {})
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
    await page.locator('.cm-content').waitFor()
    const mod = await page.evaluate(() =>
      navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
    )
    const copy = () =>
      page.evaluate(() => {
        const v = window.editor,
          data = new DataTransfer()
        v.contentDOM.dispatchEvent(
          new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
        )
        return { plain: data.getData('text/plain'), html: data.getData('text/html') }
      })
    const load = async (source, mode = 'live') => {
      await page.getByRole('button', { name: mode, exact: true }).click()
      await page.evaluate((s) => window.setDocument(s), source)
      await page.waitForTimeout(120)
    }
    const caret = async (position) => {
      await page.evaluate((p) => {
        window.editor.dispatch({ selection: { anchor: p } })
        window.editor.focus()
      }, position)
      await page.waitForTimeout(50)
    }
    for (const mode of ['live', 'preview']) {
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle('dark', value),
          dark
        )
        await load('Selected contrast words', mode)
        await caret(0)
        await page.keyboard.press('Shift+ArrowRight')
        await page.waitForTimeout(70)
        const colors = await page.evaluate(() => {
          const canvas = document.createElement('canvas'),
            context = canvas.getContext('2d')
          context.fillStyle = getComputedStyle(
            document.querySelector('.live-markdown-editor')
          ).backgroundColor
          context.fillRect(0, 0, 1, 1)
          context.fillStyle = getComputedStyle(
            document.querySelector('.cm-selectionBackground')
          ).backgroundColor
          context.fillRect(0, 0, 1, 1)
          const background = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
          context.fillStyle = getComputedStyle(document.querySelector('.cm-line')).color
          context.fillRect(0, 0, 1, 1)
          return {
            background,
            foreground: Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
          }
        })
        const a = luminance(colors.background),
          b = luminance(colors.foreground)
        assert.ok(
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
          'Selected text must remain readable in both themes'
        )
        results.push({
          name,
          mode,
          test: `${dark ? 'dark' : 'light'} selected-text contrast`,
          passed: true
        })
      }
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      try {
        const source = '# Keys\n\n中文😀abc end'
        await load(source, mode)
        await caret(source.indexOf('中文'))
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('Shift+ArrowRight')
        }
        assert.equal((await copy()).plain, '中文😀')
        assert.equal(await page.evaluate(() => window.raw), source)
        results.push({ name, mode, test: 'CJK and emoji keyboard expansion', passed: true })
      } catch (e) {
        results.push({ name, mode, test: 'CJK and emoji keyboard expansion', error: String(e) })
      }
      try {
        const source = '# Word\n\nPlain selectedWord tail.'
        await load(source, mode)
        const box = await page.evaluate(() =>
          window.editor.coordsAtPos(window.editor.state.doc.toString().indexOf('selectedWord') + 4)
        )
        await page.mouse.dblclick(box.left, (box.top + box.bottom) / 2)
        await page.waitForTimeout(80)
        assert.equal((await copy()).plain, 'selectedWord')
        results.push({ name, mode, test: 'double-click word', passed: true })
      } catch (e) {
        results.push({ name, mode, test: 'double-click word', error: String(e) })
      }
      try {
        const source =
          '# All\n\nBefore **bold** and `code`.\n\n![sample](./image.png)\n\n| A | B |\n| --- | --- |\n| one | two |\n\nAfter'
        await load(source, mode)
        await caret(source.indexOf('Before'))
        await page.keyboard.press(`${mod}+a`)
        await page.waitForTimeout(100)
        const data = await copy()
        assert.match(data.html, /<h1>/)
        assert.match(data.html, /<table>/)
        assert.match(data.html, /<img/)
        const image = page.locator('.live-md-image[data-source-selected="true"] img')
        assert.equal(await image.count(), 1)
        assert.notEqual(
          await image.evaluate((element) => getComputedStyle(element).outlineStyle),
          'none'
        )
        assert.ok(!(await page.locator('.cm-content').textContent()).includes('![sample]'))
        assert.equal(data.plain, source)
        assert.equal(await page.evaluate(() => window.raw), source)
        if (mode === 'live') {
          await page.keyboard.press('Backspace')
          await page.waitForTimeout(100)
          assert.equal(await page.evaluate(() => window.raw), '')
          await page.keyboard.press(`${mod}+z`)
          await page.waitForTimeout(100)
          assert.equal(await page.evaluate(() => window.raw), source)
        } else {
          await page.keyboard.press('Backspace')
          assert.equal(await page.evaluate(() => window.raw), source)
        }
        results.push({
          name,
          mode,
          test: 'whole document images/table copy and delete/undo',
          passed: true
        })
      } catch (e) {
        results.push({
          name,
          mode,
          test: 'whole document images/table copy and delete/undo',
          error: String(e)
        })
      }
      try {
        const source = 'Before `<img src=x onerror=alert(1)>` and [safe](javascript:alert(1)) after'
        await load(source, mode)
        await page.evaluate(() => {
          const v = window.editor,
            text = v.state.doc.toString()
          v.dispatch({
            selection: { anchor: text.indexOf('<img'), head: text.lastIndexOf(' after') }
          })
          v.focus()
        })
        const data = await copy()
        assert.match(data.html, /&lt;img/)
        assert.doesNotMatch(data.html, /<img|href="javascript:/)
        results.push({
          name,
          mode,
          test: 'clipboard keeps code literal and sanitizes link targets',
          passed: true
        })
      } catch (e) {
        results.push({
          name,
          mode,
          test: 'clipboard keeps code literal and sanitizes link targets',
          error: String(e)
        })
      }
      if (mode === 'live') {
        const source = '| A | B |\n| --- | --- |\n| **bold cell** | `cellCode` |'
        await load(source, mode)
        await page.locator('[data-table-cell="1:0"]').click()
        const input = page.getByRole('textbox', { name: '第 2 行第 1 列', exact: true })
        const data = await input.evaluate((element) => {
          const from = element.value.indexOf('old ce')
          element.setSelectionRange(from, from + 6)
          const clipboardData = new DataTransfer()
          element.dispatchEvent(
            new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true })
          )
          return {
            plain: clipboardData.getData('text/plain'),
            html: clipboardData.getData('text/html')
          }
        })
        assert.equal(data.plain, 'old ce')
        assert.match(data.html, /<strong>old ce<\/strong>/)
        assert.equal(await page.evaluate(() => window.raw), source)
        results.push({
          name,
          mode,
          test: 'partial table-cell copy retains surrounding formatting',
          passed: true
        })
      }
    }
  } finally {
    await browser.close()
  }
}
assert.deepEqual(
  results.filter((result) => result.error),
  []
)
console.log(
  `PASS: ${results.length} keyboard, double-click, whole-document image/table copy, preview protection, and delete/undo cases`
)
