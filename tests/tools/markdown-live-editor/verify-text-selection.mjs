import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { chromium, webkit } from 'playwright'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { textSelectionCases as cases } from './text-selection-cases.mjs'
const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const errors = []
const results = []
function changed(a, b) {
  a = PNG.sync.read(a)
  b = PNG.sync.read(b)
  let n = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if ([0, 1, 2].some((c) => Math.abs(a.data[i + c] - b.data[i + c]) > 4)) {
      n++
    }
  }
  return n / (a.width * a.height)
}
{
  const name = browserName,
    engine = name === 'webkit' ? webkit : chromium
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chrome' ? { channel: 'chrome' } : {})
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
    page.setDefaultTimeout(7000)
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
    await page.locator('.cm-content').waitFor()
    for (const mode of ['live', 'preview']) {
      for (const reverse of [false, true]) {
        for (const [label, body, selected, expected, tag] of cases) {
          const result = { browser: name, mode, reverse, label }
          results.push(result)
          try {
            await page.getByRole('button', { name: mode, exact: true }).click()
            const source = `# Audit\n\n${body}`
            await page.evaluate((s) => window.setDocument(s), source)
            await page.waitForTimeout(80)
            const from = source.indexOf(selected),
              to = from + selected.length
            assert.ok(from >= 0)
            await page.evaluate(() => {
              const v = window.editor
              v.dispatch({ selection: { anchor: v.state.doc.length } })
              v.focus()
              window.lastLink = ''
            })
            await page.waitForTimeout(60)
            const coords = async () =>
              page.evaluate(
                ({ from, to, reverse }) => ({
                  start: window.editor.coordsAtPos(reverse ? to : from),
                  end: window.editor.coordsAtPos(reverse ? from : to)
                }),
                { from, to, reverse }
              )
            let { start, end } = await coords()
            assert.ok(start && end)
            const clip = {
              x: Math.max(0, Math.min(start.left, end.left)),
              y: Math.min(start.top, end.top),
              width: 180,
              height: Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top)
            }
            const before = await page.screenshot({ clip })
            await page.mouse.move(
              start.left + (reverse ? -0.1 : 0.1),
              (start.top + start.bottom) / 2
            )
            await page.mouse.down()
            await page.mouse.move(end.left + (reverse ? 0.1 : -0.1), (end.top + end.bottom) / 2, {
              steps: 8
            })
            await page.waitForTimeout(50)
            ;({ end } = await coords())
            await page.mouse.move(end.left + (reverse ? 0.1 : -0.1), (end.top + end.bottom) / 2)
            await page.mouse.up()
            await page.waitForTimeout(80)
            const after = await page.screenshot({ clip })
            const copy = await page.evaluate(() => {
              const v = window.editor,
                data = new DataTransfer()
              v.contentDOM.dispatchEvent(
                new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })
              )
              return {
                plain: data.getData('text/plain'),
                html: data.getData('text/html'),
                selected: v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to),
                lastLink: window.lastLink,
                raw: window.raw
              }
            })
            result.copy = copy.plain
            result.selected = copy.selected
            result.opened = copy.lastLink
            result.highlight = changed(before, after)
            const failures = []
            if (copy.plain !== expected) {
              failures.push('plain')
            }
            if (tag && !new RegExp(`<${tag}(?:>|\\s)`).test(copy.html)) {
              failures.push('rich format')
            }
            if (copy.raw !== source) {
              failures.push('source changed')
            }
            if (copy.lastLink) {
              failures.push('opened link during selection')
            }
            if (result.highlight < 0.02) {
              failures.push('invisible selection')
            }
            result.failures = failures
          } catch (error) {
            result.error = String(error)
          }
        }
      }
    }
  } finally {
    await browser.close()
  }
}
writeFileSync(
  join(process.env.ORCA_MARKDOWN_CHECK_ARTIFACTS || tmpdir(), `${browserName}-text-selection.json`),
  JSON.stringify(results, null, 2)
)
for (const r of results.filter((r) => r.error || r.failures.length)) {
  console.log(JSON.stringify(r))
}
assert.deepEqual(
  results.filter((r) => r.error || r.failures.length),
  []
)
assert.deepEqual(errors, [])
console.log(
  `PASS: ${results.length} forward/reverse mouse selections preserve rich formatting, Typora-style text, highlight visibility, source, and link targets`
)
