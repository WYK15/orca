import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { chromium, webkit } from 'playwright'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
page.setDefaultTimeout(7000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const text = 'alpha *literal* -> &amp; <tag>\n  next [label](target)  '
const changedPixels = (before, after) => {
  const a = PNG.sync.read(before)
  const b = PNG.sync.read(after)
  assert.equal(a.data.length, b.data.length)
  let changed = 0
  for (let offset = 0; offset < a.data.length; offset += 4) {
    if (
      [0, 1, 2].some((channel) => Math.abs(a.data[offset + channel] - b.data[offset + channel]) > 4)
    ) {
      changed++
    }
  }
  return changed / (a.width * a.height)
}

try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  await page.evaluate(() => document.fonts.ready)
  for (const dark of [true, false]) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark)
    for (const mode of ['live', 'preview']) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      for (const language of ['text', 'javascript']) {
        const source = `# Code\n\n\`\`\`${language}\n${text}\n\`\`\`\n\nAfter **bold** text.`
        await page.evaluate((value) => window.setDocument(value), source)
        await page.waitForTimeout(150)
        const geometry = await page.evaluate((selected) => {
          const view = window.editor
          const from = view.state.doc.toString().indexOf(selected)
          const firstEnd = view.coordsAtPos(from + selected.indexOf('\n'))
          return {
            start: view.coordsAtPos(from),
            end: view.coordsAtPos(from + selected.length),
            firstEnd
          }
        }, text)
        assert.ok(geometry.start && geometry.end && geometry.firstEnd)
        const clip = {
          x: geometry.start.left,
          y: geometry.start.top,
          width: geometry.firstEnd.right - geometry.start.left,
          height: geometry.start.bottom - geometry.start.top
        }
        const before = await page.screenshot({ clip })
        await page.mouse.move(
          geometry.start.left + 0.1,
          (geometry.start.top + geometry.start.bottom) / 2
        )
        await page.mouse.down()
        await page.mouse.move(
          geometry.end.right - 0.1,
          (geometry.end.top + geometry.end.bottom) / 2,
          { steps: 15 }
        )
        await page.mouse.up()
        await page.waitForTimeout(100)
        const after = await page.screenshot({ clip })
        const copied = await page.evaluate(() => {
          const view = window.editor
          const clipboardData = new DataTransfer()
          view.contentDOM.dispatchEvent(
            new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true })
          )
          return {
            selected: view.state.sliceDoc(
              view.state.selection.main.from,
              view.state.selection.main.to
            ),
            plain: clipboardData.getData('text/plain'),
            html: clipboardData.getData('text/html'),
            source: window.raw
          }
        })
        assert.equal(copied.selected, text)
        assert.equal(copied.plain, text)
        assert.match(copied.html, /<pre><code>/)
        assert.match(copied.html, /&lt;tag&gt;/)
        assert.equal(copied.source, source)
        assert.ok(
          changedPixels(before, after) > 0.15,
          'Code selection must visibly change the background'
        )
        console.log(
          `PASS: ${dark ? 'dark' : 'light'}/${mode}/${language} mouse selection is visible and copies literal code`
        )
      }
    }
  }
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: `/tmp/orcaw-code-selection-${browserName}-failure.png` })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
