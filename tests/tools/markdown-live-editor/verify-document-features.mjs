import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const url = process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181'
const browser = await (process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
page.setDefaultNavigationTimeout(30000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const pause = () => page.waitForTimeout(100)
const raw = () => page.evaluate(() => window.raw)
const doc = async (source) => {
  await page.evaluate((text) => window.setDocument(text), source)
  await pause()
}
const select = async (anchor, head = anchor) => {
  await page.evaluate(
    (range) => {
      window.editor.dispatch({ selection: range })
      window.editor.focus()
    },
    { anchor, head }
  )
  await pause()
}
const mode = async (name) => {
  await page.getByRole('button', { name, exact: true }).click()
  await pause()
}

try {
  await page.goto(url)
  await page.locator('.cm-content').waitFor()
  const modifier = await page.evaluate(() =>
    navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
  )
  const metadata = '---\r\ntitle: Example\r\nvalue: "-> &gt;"\r\n---\n\n# Body\n\nUntouched -> &gt;'
  await doc(metadata)
  await select(metadata.replaceAll('\r\n', '\n').length)
  await page.locator('.live-md-metadata').waitFor()
  assert.match(await page.locator('.live-md-metadata').textContent(), /Example/)
  await page.getByRole('button', { name: '编辑元数据', exact: true }).click()
  assert.match(await page.locator('.cm-content').innerText(), /title: Example/)
  await select(11, 18)
  await page.keyboard.type('Changed')
  assert.equal(await raw(), metadata.replace('Example', 'Changed'))
  await mode('preview')
  assert.doesNotMatch(await page.locator('.cm-content').innerText(), /title:|Changed|value:/)
  await mode('source')
  await select(11)
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), metadata)
  await mode('live')
  console.log(
    'PASS: metadata reveals locally, hides in reading mode and preserves exact bytes through undo'
  )

  for (const yaml of ['scalar', '- one\n- two', 'broken: [']) {
    await doc(`---\n${yaml}\n---\n\nbody`)
    await select((await raw()).length)
    await page.locator('.live-md-metadata').waitFor()
  }
  assert.match(await page.locator('.live-md-metadata').textContent(), /YAML 语法有误/)
  await doc('---')
  await select(3)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), '---\n\n---')
  await page.keyboard.type('title: New')
  await page.keyboard.press('Enter')
  assert.equal(await raw(), '---\ntitle: New\n\n---')
  await page.keyboard.press(`${modifier}+Enter`)
  await page.keyboard.type('body')
  assert.match(await raw(), /---\n\nbody$/)
  console.log(
    'PASS: scalar, sequence and invalid YAML remain editable; Enter completes metadata and exits with Mod+Enter'
  )

  const outline = '[TOC]\n\n# Repeat\n\n###### Repeat\n\n[go](#repeat-1)\n\nend'
  await doc(outline)
  await select(outline.length)
  const toc = page.getByRole('navigation', { name: '文内目录', exact: true })
  assert.equal(await toc.locator('a').count(), 2)
  await toc.locator('a').nth(1).click()
  assert.equal(
    await page.evaluate(() => window.editor.state.selection.main.head),
    outline.indexOf('######')
  )
  await mode('preview')
  await page.locator('.live-md-link').filter({ hasText: 'go' }).click()
  assert.equal(
    await page.evaluate(() => window.editor.state.selection.main.head),
    (await raw()).indexOf('######')
  )
  await mode('live')
  await select(outline.indexOf('Repeat') + 6)
  await page.keyboard.type(' changed')
  assert.match(await toc.textContent(), /Repeat changed/)
  assert.equal(await raw(), outline.replace('# Repeat', '# Repeat changed'))
  console.log(
    'PASS: TOC updates six heading levels, handles duplicate anchors and shares internal-link navigation'
  )

  const formulas =
    'Text $x^2$ and $x + y$. Costs $10 and $20.\n\n$$\nx + y\n\nz\n$$\n\n`$code$`\n\nend'
  await doc(formulas)
  await select(formulas.length)
  await page.locator('.live-md-math .katex').first().waitFor()
  assert.equal(await page.locator('.live-md-math').count(), 3)
  assert.match(await page.locator('.cm-content').innerText(), /Costs \$10 and \$20/)
  await page.locator('.live-md-math').first().click()
  await page.keyboard.type('a')
  assert.equal(await raw(), formulas.replace('$x^2$', '$ax^2$'))
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), formulas)
  await select(formulas.indexOf('x + y\n') + 3)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), formulas.replace('x + y\n', 'x +\n y\n'))
  await doc('$$')
  await select(2)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), '$$\n\n$$')
  await page.keyboard.type('x^2')
  await page.keyboard.press(`${modifier}+Enter`)
  await page.locator('.live-md-math .katex').waitFor()
  console.log(
    'PASS: inline/display math, literal code/currency, local source editing and fence completion share undo'
  )

  const notes =
    'First[^b], second[^a], again[^b], unknown[^missing].\n\n[^a]: Alpha **bold**\n\n[^b]: Beta $x^2$\n    continuation\n\nend'
  await doc(notes)
  await select(notes.length)
  assert.deepEqual(await page.locator('.live-md-note-reference').allTextContents(), ['1', '2', '1'])
  assert.equal(await page.locator('.live-md-footnotes li[data-footnote-number]').count(), 2)
  assert.match(await page.locator('[data-footnote-number="1"]').textContent(), /Beta/)
  await page.getByRole('link', { name: '脚注 1', exact: true }).first().hover()
  await page.locator('[data-slot="hover-card-content"]').waitFor()
  assert.match(await page.locator('[data-slot="hover-card-content"]').textContent(), /continuation/)
  await page.mouse.move(10, 10)
  await page
    .locator('[data-footnote-number="2"]')
    .getByRole('button', { name: '编辑脚注', exact: true })
    .click()
  await page.keyboard.type('New ')
  assert.equal(await raw(), notes.replace('Alpha', 'New Alpha'))
  await mode('source')
  await select(notes.indexOf('Alpha'))
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), notes)
  await mode('preview')
  assert.match(await page.locator('.cm-content').innerText(), /unknown\[\^missing\]/)
  assert.equal(await page.getByRole('button', { name: '编辑脚注', exact: true }).count(), 0)
  await page.getByRole('link', { name: '脚注 1', exact: true }).first().click()
  await page
    .locator('[data-footnote-number="1"]')
    .getByRole('button', { name: '返回引用 2', exact: true })
    .click()
  assert.equal(
    await page.evaluate(() => window.editor.state.selection.main.head),
    notes.lastIndexOf('[^b]', notes.indexOf('unknown'))
  )
  assert.equal(await raw(), notes)
  await mode('live')
  console.log(
    'PASS: footnote numbering, repeated references, hover, edit, reading navigation and cross-mode undo'
  )

  const longNotes = `Top[^x]\n\n[^x]: Middle definition\n\n${'Long paragraph.\n\n'.repeat(120)}end`
  await doc(longNotes)
  await mode('preview')
  await select(0)
  await page.getByRole('link', { name: '脚注 1', exact: true }).click()
  await page.locator('[data-footnote-number="1"]').waitFor()
  assert.ok(await page.locator('[data-footnote-number="1"]').isVisible())
  await page
    .locator('[data-footnote-number="1"]')
    .getByRole('button', { name: '返回引用', exact: true })
    .click()
  assert.equal(await page.evaluate(() => window.editor.state.selection.main.head), 3)
  assert.equal(await raw(), longNotes)

  const tableMath =
    '# Target\n\n| A | B |\n| --- | --- |\n| $x^2$ | H<sub>2</sub>O |\n\n[go](#target)\n\nend'
  await doc(tableMath)
  await page.locator('.live-md-table .katex').waitFor()
  assert.equal(await page.locator('.live-md-table sub').textContent(), '2')
  await page.locator('.live-md-link').filter({ hasText: 'go' }).click()
  assert.equal(await page.evaluate(() => window.editor.state.selection.main.head), 0)
  assert.equal(await raw(), tableMath)
  await mode('live')
  console.log(
    'PASS: virtualized footnote navigation and links after tables retain accurate positions; table math/HTML render'
  )

  const html =
    'Water H<sub>2</sub>O, x<sup>2</sup>, <mark>marked</mark>, <kbd>Enter</kbd>, <span style="color: red; font-size: 16px; position: fixed; background-image: url(https://invalid.example/tracker)">styled</span>.\n\n<img src="./res/privacy.png" width="120" onerror="window.htmlExecuted=1">\n\n<details><summary>More</summary><p>Details body</p></details>\n\nend'
  await doc(html)
  await select(html.length)
  assert.equal(await page.locator('.live-md-html-inline sub').textContent(), '2')
  assert.equal(await page.locator('.live-md-html-inline sup').textContent(), '2')
  assert.equal(await page.locator('.live-md-html-inline mark').textContent(), 'marked')
  const style = await page.locator('.live-md-html-inline span[style]').getAttribute('style')
  assert.match(style, /color: red/)
  assert.doesNotMatch(style, /position|background-image|url\(/)
  const image = page.locator('.live-md-html img')
  await image.waitFor()
  assert.match(await image.getAttribute('src'), /^data:image\/svg/)
  assert.equal(await image.getAttribute('onerror'), null)
  await page.locator('.live-md-html summary').click()
  assert.equal(await page.locator('.live-md-html details').getAttribute('open'), '')
  for (const name of ['preview', 'live']) {
    await mode(name)
    await select(html.length)
    await page.locator('.live-md-html summary').waitFor()
    await page.locator('.live-md-html img').waitFor()
    assert.equal(await raw(), html)
  }
  await page.locator('.live-md-html-inline sub').click()
  await page.keyboard.type('b')
  assert.equal(await raw(), html.replace('<sub>', '<bsub>'))
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), html)
  console.log(
    'PASS: common inline HTML, authored styles, authorized images and details preserve local source editing'
  )

  const unsafe =
    'Safe <span onclick="window.htmlExecuted=1">click</span>\n\n<script>window.htmlExecuted=1</script>\n\n<Widget prop="value" />\n\n<!-- comment -->\n\nend'
  await doc(unsafe)
  await select(unsafe.length)
  await mode('preview')
  await page.locator('.live-md-html-inline span').click()
  assert.equal(await page.evaluate(() => window.htmlExecuted), undefined)
  assert.equal(await page.locator('.cm-content script').count(), 0)
  assert.match(await page.locator('.cm-content').innerText(), /<script>|<Widget/)
  assert.doesNotMatch(await page.locator('.cm-content').innerText(), /<!-- comment -->/)
  assert.equal(await raw(), unsafe)
  await mode('source')
  await select(unsafe.length)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), `${unsafe}\n`)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: unsafe/unsupported HTML stays local source, scripts/events never run, source Enter stays literal; no browser exceptions'
  )
} catch (error) {
  await page.screenshot({ path: '/tmp/orcaw-markdown-document-failure.png' })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
