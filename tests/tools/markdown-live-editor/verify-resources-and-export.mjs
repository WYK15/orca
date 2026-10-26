import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const browser = await (process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const pause = () => page.waitForTimeout(120)
const raw = () => page.evaluate(() => window.raw)
const doc = async (source) => {
  await page.evaluate((value) => window.setDocument(value), source)
  await pause()
}
const select = async (anchor, head = anchor) => {
  await page.evaluate(
    (selection) => {
      window.editor.dispatch({ selection })
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
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const mod = await page.evaluate(() => (navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'))
  const linked =
    'Before ->\r\n\r\n[first][ref] and [second][ref]\n\n[ref]: old.md "Original"\n\nend'
  await doc(linked)
  await select(linked.replaceAll('\r\n', '\n').indexOf('first') + 2)
  await page.keyboard.press(`${mod}+k`)
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.getByLabel('链接地址', { exact: true }).inputValue(), 'old.md')
  await page.getByLabel('链接地址', { exact: true }).fill('next page.md')
  await page.getByRole('button', { name: '应用', exact: true }).click()
  assert.equal(await raw(), linked.replace('[first][ref]', '[first](next%20page.md "Original")'))
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), linked)
  console.log(
    'PASS: link dialog edits only one reference occurrence and preserves mixed EOLs with exact undo'
  )

  const cellLink = '| A | B |\n| --- | --- |\n| [cell](old.md) | other |\n\nend'
  await doc(cellLink)
  await page.locator('[data-table-cell="1:0"]').click()
  const input = page.locator('.live-md-cell-input')
  await input.evaluate((element) => {
    element.focus()
    element.setSelectionRange(3, 3)
  })
  await page.keyboard.press(`${mod}+k`)
  await page.getByLabel('链接地址', { exact: true }).fill('new.md')
  await page.getByRole('button', { name: '应用', exact: true }).click()
  await pause()
  assert.equal(await raw(), cellLink.replace('old.md', 'new.md'))
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), cellLink)
  console.log('PASS: link editing uses the active table-cell caret and restores focus/history')

  const picture = 'Before\n\n![privacy](./res/privacy.png "Hint")\n\nend'
  await doc(picture)
  await select(picture.length)
  await page.getByRole('button', { name: '编辑图片', exact: true }).click()
  await page.getByLabel('宽度（px）', { exact: true }).fill('180')
  await page.getByRole('button', { name: '应用', exact: true }).click()
  await select((await raw()).length)
  const image = page.locator('.live-md-html img')
  await image.waitFor()
  assert.equal(await image.getAttribute('width'), '180')
  await image.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '编辑图片', exact: true }).click()
  await page.getByLabel('图片说明', { exact: true }).fill('Changed')
  await page.getByRole('button', { name: '应用', exact: true }).click()
  assert.match(await raw(), /alt="Changed"/)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), picture)
  console.log(
    'PASS: image dimensions convert to editable HTML; context edits and both undo steps preserve source'
  )

  await select(picture.length)
  await page.getByRole('button', { name: '编辑图片', exact: true }).click()
  await page.getByLabel('图片说明', { exact: true }).fill('Stale')
  await page.evaluate(() => window.editor.dispatch({ changes: { from: 0, insert: 'New ' } }))
  await page.getByRole('button', { name: '应用', exact: true }).click()
  assert.match(await page.getByRole('alert').textContent(), /文档已改变/)
  assert.equal(await raw(), `New ${picture}`)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  console.log('PASS: stale resource dialogs cannot overwrite newer source')

  await doc('# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nend')
  await select(12)
  await page.getByRole('button', { name: '写作设置', exact: true }).click()
  await page.getByRole('checkbox', { name: '专注模式', exact: true }).click()
  await page.getByRole('checkbox', { name: '打字机模式', exact: true }).click()
  await page.getByRole('checkbox', { name: '拼写检查', exact: true }).click()
  await page.getByLabel('正文宽度', { exact: true }).click()
  await page.getByRole('option', { name: '适合阅读的宽度', exact: true }).click()
  await page.getByLabel('图片资源目录', { exact: true }).fill('../outside')
  assert.equal(
    await page.getByRole('button', { name: '保存资源目录', exact: true }).isEnabled(),
    false
  )
  await page.getByLabel('图片资源目录', { exact: true }).fill('{filename}.assets')
  await page.getByRole('button', { name: '保存资源目录', exact: true }).click()
  await page.keyboard.press('Escape')
  await select(13)
  assert.ok((await page.locator('.live-md-focus-line').count()) > 0)
  assert.equal(await page.locator('.cm-content').getAttribute('spellcheck'), 'true')
  await page.reload()
  await page.locator('.cm-content').waitFor()
  await page.getByRole('button', { name: '写作设置', exact: true }).click()
  for (const name of ['专注模式', '打字机模式', '拼写检查']) {
    assert.equal(
      await page.getByRole('checkbox', { name, exact: true }).getAttribute('data-state'),
      'checked'
    )
    await page.getByRole('checkbox', { name, exact: true }).click()
  }
  assert.equal(
    await page.getByLabel('图片资源目录', { exact: true }).inputValue(),
    '{filename}.assets'
  )
  await page.getByLabel('图片资源目录', { exact: true }).fill('')
  await page.getByRole('button', { name: '保存资源目录', exact: true }).click()
  await page.getByLabel('正文宽度', { exact: true }).click()
  await page.getByRole('option', { name: '填满编辑区域', exact: true }).click()
  await page.keyboard.press('Escape')
  console.log(
    'PASS: writing preferences persist, focus/spelling apply, and asset folders reject traversal'
  )

  const exported = [
    '[TOC]\n\n# Export\n\nText $x^2$ and note[^n].\n\n`<span style="position:fixed">literal</span>`\n\n![Image](./local.png)\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```mermaid\ngraph TD; A-->B\n```\n\n[^n]: Footnote **bold**\n\n',
    'Long paragraph.\n\n'.repeat(100),
    '# Last heading\n\nEnd $z^3$ and tail[^tail].\n\n[^tail]: Last footnote\n\n<script>window.exportScript=1</script>\n\n<span onclick="window.exportScript=1" style="position:fixed;color:red">safe</span>\n'
  ].join('')
  await doc(exported)
  await select(0)
  await page.evaluate(() => {
    window.api = {
      export: {
        htmlToFile: async (payload) => {
          window.exported = payload
          return { success: true }
        },
        printHtml: async (payload) => {
          window.printed = payload
          return { opened: true }
        }
      }
    }
  })
  await page.getByRole('button', { name: '导出文档', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出独立 HTML', exact: true }).click()
  await page.waitForFunction(() => !!window.exported, { timeout: 30000 })
  const html = await page.evaluate(() => window.exported.html)
  assert.match(html, /Last heading/)
  assert.match(html, /href="#last-heading"/)
  assert.match(html, /Last footnote/)
  assert.match(html, /<mi>z<\/mi>/)
  assert.match(html, /markdown-footnotes/)
  assert.match(html, /markdown-toc/)
  assert.match(html, /data:image\/svg/)
  assert.match(html, /data:font\/woff2|data:application\/octet-stream/)
  assert.match(html, /class="katex/)
  assert.match(html, /<svg/)
  assert.doesNotMatch(html, /<script|onclick=|src:url\(fonts\//)
  assert.doesNotMatch(html, /live-md-table-toolbar|live-md-row-grip|编辑图片|写作设置/)
  assert.equal(await raw(), exported)
  await mode('source')
  await page.getByRole('button', { name: '导出文档', exact: true }).click()
  await page.getByRole('menuitem', { name: '打印 / 导出 PDF', exact: true }).click()
  await page.waitForFunction(() => !!window.printed)
  const printed = await page.evaluate(() => window.printed.html)
  assert.match(printed, /Last heading/)
  assert.match(printed, /markdown-footnotes/)
  assert.equal(await raw(), exported)
  const paper = await browser.newPage()
  await paper.setContent(html)
  assert.equal(await paper.locator('script').count(), 0)
  assert.match(await paper.locator('code').first().textContent(), /style="position:fixed"/)
  assert.equal(
    await paper
      .locator('[style]')
      .evaluateAll((nodes) => nodes.some((node) => node.style.position === 'fixed')),
    false
  )
  assert.equal(
    await paper
      .locator('img')
      .evaluateAll((images) => images.every((image) => image.src.startsWith('data:'))),
    true
  )
  await paper.screenshot({
    path: `/tmp/orcaw-markdown-export-${process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'}.png`
  })
  await paper.close()
  console.log(
    'PASS: full-document HTML and print export include offscreen content, images, math fonts and diagrams without editor UI or source changes'
  )
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: '/tmp/orcaw-markdown-resources-failure.png' })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
