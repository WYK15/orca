import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'
import { parser, GFM } from '@lezer/markdown'

const browserName = process.env.ORCA_MARKDOWN_CHECK_BROWSER || 'chrome'
const browser = await (browserName === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const pause = () => page.waitForTimeout(100)
const raw = () => page.evaluate(() => window.raw)
const select = async (anchor) => {
  await page.evaluate((position) => {
    window.editor.dispatch({ selection: { anchor: position } })
    window.editor.focus()
  }, anchor)
  await pause()
}
const load = async (source, anchor = source.length) => {
  await page.evaluate((text) => window.setDocument(text), source)
  await pause()
  await select(anchor)
}
function ownedBlocks(source, type = 'FencedCode') {
  const blocks = []
  parser
    .configure(GFM)
    .parse(source)
    .iterate({
      enter(n) {
        if (n.name !== type) {
          return
        }
        let parent = n.node.parent,
          owned = false
        while (parent) {
          if (parent.name === 'ListItem') {
            owned = true
          }
          parent = parent.parent
        }
        blocks.push({
          owned,
          closed: type !== 'FencedCode' || n.node.getChildren('CodeMark').length === 2
        })
      }
    })
  assert.ok(blocks.length > 0, `Missing ${type}`)
  assert.ok(
    blocks.every((b) => b.owned && b.closed),
    JSON.stringify({ source, blocks })
  )
}

try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const mod = await page.evaluate(() => (navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'))
  for (const [before, after] of [
    [
      '8. alpha\n9. bravo\n   ```text\n   x\n   ```\n10. next',
      '8. alpha\n9. \n10. bravo\n    ```text\n    x\n    ```\n11. next'
    ],
    [
      '98. alpha\n99. bravo\n    ```text\n    x\n    ```\n100. next',
      '98. alpha\n99. \n100. bravo\n     ```text\n     x\n     ```\n101. next'
    ]
  ]) {
    await load(before, before.indexOf('\n'))
    await page.keyboard.press('Enter')
    assert.equal(await raw(), after)
    ownedBlocks(await raw())
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), before)
    await page.keyboard.press(`${mod}+Shift+z`)
    await pause()
    assert.equal(await raw(), after)
    await page.keyboard.type('new')
    assert.match(await raw(), /\n(?:9|99)\. new\n/)
  }
  console.log(
    'PASS: growing marker widths resize child code with exact undo/redo and correct typing position'
  )

  const original = 'Before ->\r\n\r\n1. alpha\r\n2. bravo\r\n\r\nAfter &gt;'
  const normalized = original.replaceAll('\r\n', '\n')
  for (const entry of ['toolbar', 'paste']) {
    await load(original, normalized.indexOf('alpha') + 5)
    await page.keyboard.press('Shift+Enter')
    const before = await raw()
    if (entry === 'toolbar') {
      await page.getByRole('button', { name: '代码块', exact: true }).click()
      await page.keyboard.type('x')
    } else {
      await page.locator('.cm-content').evaluate((el) => {
        const data = new DataTransfer()
        data.setData('text/html', '<pre><code>x</code></pre>')
        el.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
        )
      })
    }
    await pause()
    ownedBlocks((await raw()).replaceAll('\r\n', '\n'))
    const closed = (await raw()).replaceAll('\r\n', '\n')
    await select(closed.lastIndexOf('```') + 3)
    await page.keyboard.press('Enter')
    await page.keyboard.type('next')
    assert.match(await raw(), /\r\n2\. next\r\n/)
    assert.match(await raw(), /3\. bravo/)
    assert.ok((await raw()).startsWith('Before ->\r\n'))
    assert.ok((await raw()).endsWith('\r\n\r\nAfter &gt;'))
    assert.notEqual(await raw(), before)
  }
  console.log(
    'PASS: toolbar and HTML code paste retain list ownership, mixed line endings and following numbering'
  )

  for (const entry of ['slash', 'typed']) {
    await load('> 1. alpha\n> 2. bravo', 10)
    await page.keyboard.press('Shift+Enter')
    if (entry === 'slash') {
      await page.keyboard.type('/')
      await page.locator('.cm-tooltip-autocomplete').waitFor()
      await page
        .locator('.cm-completionLabel')
        .filter({ hasText: /^代码块$/ })
        .click()
    } else {
      await page.keyboard.type('```')
      await page.keyboard.press('Enter')
    }
    await page.keyboard.type('x')
    await pause()
    ownedBlocks(await raw())
    assert.match(await raw(), /\n>    x\n>    ```/)
    const closing = (await raw()).lastIndexOf('```') + 3
    await select(closing)
    await page.keyboard.press('Enter')
    await page.keyboard.type('next')
    assert.match(await raw(), /\n> 2\. next\n/)
    assert.match(await raw(), /> 3\. bravo/)
  }
  console.log(
    'PASS: quoted list slash completion and typed fences both create complete owned blocks and resume numbering'
  )

  for (const prefix of ['   ', '>    ']) {
    const start = prefix.startsWith('>') ? '> 1. alpha\n>\n' : '1. alpha\n\n'
    const end = prefix.startsWith('>') ? '> 2. bravo' : '2. bravo'
    const source = `${start}${prefix}| A | B |\n${prefix}| --- | --- |\n${prefix}| x | y |\n${end}`
    await load(source)
    await page.locator('[data-table-cell="1:1"]').click()
    await page.keyboard.press('Tab')
    await page.getByRole('textbox', { name: '第 3 行第 1 列', exact: true }).fill('new')
    await pause()
    assert.equal(
      await raw(),
      source.replace(`${prefix}| x | y |`, `${prefix}| x | y |\n${prefix}|   new|   |`)
    )
    ownedBlocks(await raw(), 'Table')
    await page.keyboard.press(`${mod}+z`)
    await pause()
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), source)
  }
  console.log(
    'PASS: Tab-created table rows retain list/quote prefixes and editing plus row creation undo exactly'
  )
  await load('1. alpha\n2. bravo', 8)
  await page.keyboard.press('Shift+Enter')
  const beforeTable = await raw()
  await page.getByRole('button', { name: '表格', exact: true }).click()
  await page.getByRole('gridcell').nth(12).click()
  const input = page.getByRole('textbox', { name: '第 2 行第 1 列', exact: true })
  assert.ok(await input.evaluate((el) => el === document.activeElement))
  await input.fill('picked')
  ownedBlocks(await raw(), 'Table')
  assert.match(await raw(), /\n   \|/)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), beforeTable)
  console.log(
    'PASS: the toolbar table picker focuses the correct owned cell and insertion undoes independently of typing'
  )
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
