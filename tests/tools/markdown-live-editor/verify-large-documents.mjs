import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, webkit } from 'playwright'

const name = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (name === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const normalize = (text) => text.replace(/\r\n|\r/g, '\n')
const hash = (text) => createHash('sha256').update(text).digest('hex')
const raw = () => page.evaluate(() => window.raw)
const pause = () => page.waitForTimeout(100)
const load = async (source) => {
  const started = performance.now()
  await page.evaluate((text) => window.setDocument(text), source)
  await page.waitForFunction(
    (text) => window.editor.state.doc.toString() === text,
    normalize(source)
  )
  await pause()
  assert.equal(await raw(), source)
  return performance.now() - started
}
const select = async (anchor, head = anchor) => {
  await page.evaluate(
    (selection) => {
      window.editor.dispatch({ selection, scrollIntoView: true })
      window.editor.focus()
    },
    { anchor, head }
  )
  await pause()
}
function rawOffset(source, normalizedPosition) {
  let raw = 0,
    normalized = 0
  while (normalized < normalizedPosition) {
    if (source[raw] === '\r' && source[raw + 1] === '\n') {
      raw++
    }
    raw++
    normalized++
  }
  return raw
}
const measurements = {
  browser: name,
  browserVersion: browser.version(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  samples: []
}
try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const mod = await page.evaluate(() => (navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'))
  const paths = JSON.parse(process.env.ORCA_MARKDOWN_TEST_DOCUMENTS || '[]')
  const samples = []
  for (const path of paths) {
    samples.push({ path, source: await readFile(path, 'utf8') })
  }
  if (!samples.length) {
    samples.push({
      path: null,
      source:
        '# Manual\r\n\r\nText -> &gt;\n\n| Key | Value |\r\n| --- | --- |\r\n| one | two |\n\nend'
    })
  }
  for (const sample of samples) {
    const { source, path } = sample
    const loadMs = await load(source)
    for (const mode of ['preview', 'source', 'live']) {
      await page.getByRole('button', { name: mode, exact: true }).click()
      await pause()
      assert.equal(await raw(), source)
    }
    const heading = /^#{1,6}[\t ]+(.+)$/m.exec(source)
    assert.ok(heading, `No heading in ${path ?? 'fixture'}`)
    const word = /[\p{L}\p{N}]{2}/u.exec(heading[1])
    assert.ok(word)
    const fromRaw = heading.index + heading[0].indexOf(heading[1]) + word.index
    const position = normalize(source.slice(0, fromRaw)).length
    await select(position, position + word[0].length)
    await page.keyboard.press('Backspace')
    assert.equal(await raw(), source.slice(0, fromRaw) + source.slice(fromRaw + word[0].length))
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), source)
    const headings = [...source.matchAll(/^(#{1,6})[\t ]+([^\r\n]*)/gm)]
    const section = headings.find((heading) => /^1\.3(?:[^\d]|$)/.test(heading[2]))
    if (section) {
      const next = headings.find(
        (heading) => heading.index > section.index && heading[1].length <= section[1].length
      )
      const end = next?.index ?? source.length
      await select(
        normalize(source.slice(0, section.index)).length,
        normalize(source.slice(0, end)).length
      )
      await page.keyboard.press('Backspace')
      assert.equal(hash(await raw()), hash(source.slice(0, section.index) + source.slice(end)))
      await page.keyboard.press(`${mod}+z`)
      await pause()
      assert.equal(hash(await raw()), hash(source))
    }
    const table = /^ {0,3}\|.*\|\r?\n {0,3}\|[\t :|-]+\|\r?\n/m.exec(source)
    if (table) {
      await select(normalize(source.slice(0, table.index)).length)
      await page.locator('.live-md-table').first().locator('tbody td').first().click()
      const range = await page.evaluate(
        async (url) => {
          const { tableCellSelection } = await import(url)
          return window.editor.state.field(tableCellSelection)
        },
        `/@fs${pathToFileURL(resolve('src/renderer/src/components/editor/live-markdown/table-cell-selection.ts')).pathname}`
      )
      assert.ok(range)
      const start = rawOffset(source, range.from),
        end = rawOffset(source, range.to)
      await page.locator('.live-md-cell-input').fill('Acceptance value')
      assert.equal(await raw(), `${source.slice(0, start)}Acceptance value${source.slice(end)}`)
      await page.keyboard.press(`${mod}+z`)
      await pause()
      assert.equal(await raw(), source)
    }
    if (path) {
      assert.equal(hash(await readFile(path, 'utf8')), hash(source))
    }
    measurements.samples.push({
      file: path ?? 'mixed-EOL fixture',
      characters: source.length,
      sha256: hash(source),
      loadMs,
      tableEdited: !!table,
      section13Deleted: !!section
    })
  }
  console.log(
    'PASS: real-document copies retain exact bytes through view switches, local heading/table edits and undo; originals are unchanged'
  )

  const sections = 2000
  const source = `[TOC]\n\n${Array.from({ length: sections }, (_, index) => `## Heading ${index}\n\n中文文字和 paragraph ${index}. A -> B &gt; data.\n\n| Key | Value |\n| --- | --- |\n| item | value ${index} |\n\n\`\`\`javascript\nconst item = ${index}\n\`\`\`\n\n`).join('')}`
  const loadMs = await load(source)
  await page.evaluate(
    async (url) => {
      const { readMarkdownDocument } = await import(url)
      window.readDocumentModel = readMarkdownDocument
      window.editor.dispatch({ selection: { anchor: 10 } })
      window.editor.scrollDOM.scrollTop = 0
    },
    `/@fs${pathToFileURL(resolve('src/renderer/src/components/editor/live-markdown/markdown-document-model.ts')).pathname}`
  )
  await page.waitForFunction(
    (count) => window.readDocumentModel(window.editor.state).headings.length === count,
    sections
  )
  await page
    .getByRole('navigation', { name: '文内目录', exact: true })
    .locator('a')
    .nth(sections - 1)
    .waitFor({ state: 'attached' })
  assert.equal(
    await page.getByRole('navigation', { name: '文内目录', exact: true }).locator('a').count(),
    sections
  )
  await select(source.length)
  const timings = await page.evaluate(async () => {
    const values = []
    for (let index = 0; index < 20; index++) {
      const started = performance.now()
      const end = window.editor.state.doc.length
      window.editor.dispatch({
        changes: { from: end, insert: 'x' },
        selection: { anchor: end + 1 },
        userEvent: 'input.type'
      })
      await new Promise(requestAnimationFrame)
      values.push(performance.now() - started)
    }
    return values.sort((a, b) => a - b)
  })
  await page.waitForFunction((expected) => window.raw === expected, source + 'x'.repeat(20))
  assert.equal(hash(await raw()), hash(source + 'x'.repeat(20)))
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(hash(await raw()), hash(source))
  measurements.generated = {
    characters: source.length,
    sections,
    loadMs,
    editFrameP50Ms: timings[10],
    editFrameP95Ms: timings[18]
  }
  assert.deepEqual(errors, [])
  const output = `/tmp/orcaw-markdown-performance-${name}.json`
  await writeFile(output, JSON.stringify(measurements, null, 2))
  console.log(
    `PASS: ${source.length} characters, ${sections} TOC entries, reversible typing and virtualization; timings: ${JSON.stringify(measurements.generated)}`
  )
} catch (error) {
  await page.screenshot({ path: `/tmp/orcaw-large-documents-${name}-failure.png` })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
