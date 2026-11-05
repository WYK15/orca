import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium, webkit } from 'playwright'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const fixture = process.env.ORCA_MARKDOWN_SCROLL_FIXTURE
const table = (rows) =>
  [
    '| Item | Description |',
    '| --- | --- |',
    ...Array.from(
      { length: rows },
      (_, index) => `| Item ${index} | ${'设备信息和服务端参数的说明。'.repeat(12)} |`
    )
  ].join('\n')
const source = fixture
  ? readFileSync(fixture, 'utf8')
  : [
      '# Diagram scrolling',
      '## Sequence',
      '```mermaid\nsequenceDiagram\nparticipant C as Client\nparticipant S as Server\nparticipant F as Probe service\nC->>S: Load page and configuration\nS-->>C: Return parameters and session data\nC->>C: Initialize and collect device data\nC->>F: Request network probe\nF-->>C: Return probe body\nC->>C: Cache results\nloop Business requests\nC->>C: Reuse cached results\nC->>C: Encode collected data and split fields\nC->>S: Send request with generated headers\nend\n```',
      'Additional explanation before the first table.',
      '## First table',
      table(8),
      '## Second table',
      table(9),
      '## Third table',
      table(8),
      'Last paragraph.'
    ].join('\n\n')
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(15000)
try {
  for (const width of [1280, 900]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
    await page.locator('.cm-content').waitFor()
    await page.evaluate((text) => window.setDocument(text), source)
    await page.getByRole('button', { name: 'preview', exact: true }).click()
    await page.locator('.live-md-diagram svg').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)
    await page.evaluate(() => window.editor.focus())
    await page.mouse.move(width - 120, 680)
    await page.mouse.wheel(0, 5000)
    await page.waitForTimeout(250)
    const baseline = await page.evaluate(() => {
      const element = window.editor.scrollDOM
      window.scrollSamples = []
      window.sampleScroll = () =>
        window.scrollSamples.push({
          top: element.scrollTop,
          height: element.scrollHeight,
          diagram: !!document.querySelector('.live-md-diagram')
        })
      element.addEventListener('scroll', window.sampleScroll)
      window.samplingScroll = true
      const sample = () => {
        window.sampleScroll()
        if (window.samplingScroll) {
          requestAnimationFrame(sample)
        }
      }
      requestAnimationFrame(sample)
      return element.scrollHeight
    })
    for (let cycle = 0; cycle < 4; cycle++) {
      for (let step = 0; step < 3; step++) {
        await page.mouse.wheel(0, -500)
        await page.waitForTimeout(12)
      }
      await page.waitForTimeout(25)
      await page.mouse.wheel(0, 1000)
      await page.mouse.wheel(0, 1000)
      await page.waitForTimeout(140)
    }
    const result = await page.evaluate(() => {
      window.samplingScroll = false
      window.editor.scrollDOM.removeEventListener('scroll', window.sampleScroll)
      return {
        samples: window.scrollSamples,
        top: window.editor.scrollDOM.scrollTop,
        source: window.raw
      }
    })
    const minimum = Math.min(...result.samples.map((sample) => sample.height))
    assert.equal(result.source, source)
    assert.ok(result.top > 100, 'Fast downward scrolling must not return to the document start')
    assert.ok(
      minimum >= baseline - 3,
      `Diagram remount collapsed the document by ${baseline - minimum}px`
    )
    assert.ok(
      result.samples.some((sample) => !sample.diagram),
      'The diagram must leave the rendered viewport'
    )
    assert.ok(
      result.samples.some((sample) => sample.diagram),
      'The diagram must remount during the wheel sequence'
    )
    console.log(
      `PASS: ${width}px rapid wheel scrolling retains document height across diagram remounts`
    )
  }
  await page.evaluate(() => {
    window.editor.scrollDOM.scrollTop = 0
  })
  await page.locator('.live-md-diagram svg').waitFor()
  const diagramHeight = await page
    .locator('.live-md-diagram')
    .evaluate((element) => element.getBoundingClientRect().height)
  await page.evaluate(() => {
    const view = window.editor,
      text = view.state.doc.toString()
    const from = text.indexOf('\n', text.indexOf('```mermaid')) + 1
    const to = text.indexOf('\n```', from)
    view.dispatch({ changes: { from, to, insert: 'not a valid diagram' } })
  })
  await page.locator('.live-md-diagram .mermaid-error').waitFor()
  await page.waitForTimeout(100)
  const fallback = await page.locator('.live-md-diagram').evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    placeholder: element.style.minHeight
  }))
  assert.equal(fallback.placeholder, '')
  assert.ok(
    fallback.height < diagramHeight,
    'A diagram error must release its old placeholder height'
  )
  await page.evaluate((text) => window.setDocument(text), source)
  await page.locator('.live-md-diagram svg').waitFor()
  assert.equal(await page.evaluate(() => window.raw), source)
  console.log(
    'PASS: asynchronous diagram errors release the placeholder and valid source renders again'
  )
  if (fixture) {
    assert.equal(readFileSync(fixture, 'utf8'), source)
  }
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: `/tmp/orcaw-diagram-scroll-${browserName}-failure.png` })
  throw error
} finally {
  await browser.close()
}
