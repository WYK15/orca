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
        const tail = {
          x: geometry.firstEnd.right + 12,
          y: clip.y,
          width: 120,
          height: clip.height
        }
        const firstLine = await page.locator('.live-md-code-line').first().boundingBox()
        const lastLine = await page.locator('.live-md-code-line').last().boundingBox()
        assert.ok(firstLine && lastLine)
        const side = {
          x: firstLine.x + firstLine.width + 2,
          y: clip.y,
          width: 20,
          height: clip.height
        }
        const below = {
          x: firstLine.x,
          y: lastLine.y + lastLine.height + 1,
          width: 900,
          height: 40
        }
        const before = await page.screenshot({ clip })
        const tailBefore = await page.screenshot({ clip: tail })
        const sideBefore = await page.screenshot({ clip: side })
        const belowBefore = await page.screenshot({ clip: below })
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
        assert.ok(
          changedPixels(tailBefore, await page.screenshot({ clip: tail })) < 0.01,
          'Selecting code must leave the background after the text unchanged'
        )
        assert.ok(
          changedPixels(sideBefore, await page.screenshot({ clip: side })) < 0.01,
          'Selecting code must not paint outside the code block'
        )
        assert.ok(
          changedPixels(belowBefore, await page.screenshot({ clip: below })) < 0.01,
          'Selecting and copying code must leave the region below the block unchanged'
        )
        await page.evaluate(() => {
          const view = window.editor
          const source = view.state.doc.toString()
          view.dispatch({
            selection: { anchor: source.indexOf('alpha'), head: source.indexOf('After') + 5 }
          })
        })
        await page.waitForTimeout(100)
        assert.ok(
          changedPixels(belowBefore, await page.screenshot({ clip: below })) > 0.01,
          'A selection extending into the following paragraph must still be highlighted'
        )
        console.log(
          `PASS: ${dark ? 'dark' : 'light'}/${mode}/${language} code selection preserves outside backgrounds, copies literal text, and supports cross-block selection`
        )
      }

      const label = 'sampleQueryStatus'
      const selected = label.slice(2, -2)
      const source = `# List\n\n- \`${label}\`\n- \`sampleBeginExchange\`\n- ordinary text`
      await page.evaluate((value) => window.setDocument(value), source)
      await page.evaluate(() => {
        const view = window.editor
        view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('Query') } })
        view.focus()
      })
      await page.waitForTimeout(100)
      const geometry = await page.evaluate((selected) => {
        const view = window.editor
        const from = view.state.doc.toString().indexOf(selected)
        return { start: view.coordsAtPos(from), end: view.coordsAtPos(from + selected.length) }
      }, selected)
      const { start, end } = geometry
      assert.ok(start && end)
      const clip = {
        x: start.left,
        y: start.top,
        width: end.left - start.left,
        height: start.bottom - start.top
      }
      const before = await page.screenshot({ clip })
      await page.mouse.move(start.left + 0.1, (start.top + start.bottom) / 2)
      await page.mouse.down()
      await page.mouse.move(end.left - 0.1, (end.top + end.bottom) / 2, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(100)
      assert.ok(
        changedPixels(before, await page.screenshot({ clip })) > 0.15,
        'Inline code inside a list must have a visible selection background'
      )
      const copied = await page.evaluate(() => {
        const clipboardData = new DataTransfer()
        window.editor.contentDOM.dispatchEvent(
          new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true })
        )
        return { plain: clipboardData.getData('text/plain'), source: window.raw }
      })
      assert.equal(copied.plain, selected)
      assert.equal(copied.source, source)
      console.log(
        `PASS: ${dark ? 'dark' : 'light'}/${mode} list inline code has visible mouse selection and copies its text`
      )
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
