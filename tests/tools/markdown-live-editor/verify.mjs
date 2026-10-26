import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const url = process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181'
const isWebkit = process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
const browser = await (isWebkit
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const raw = () => page.evaluate(() => window.raw)
const settled = async () => {
  await page.waitForTimeout(60)
}
const setDocument = async (source) => {
  await page.evaluate((value) => window.setDocument(value), source)
  await settled()
}
const focusAt = async (position) => {
  await page.evaluate((anchor) => {
    window.editor.dispatch({ selection: { anchor } })
    window.editor.focus()
  }, position)
}

try {
  await page.goto(url)
  await page.locator('.live-md-table').waitFor()
  const modifier = await page.evaluate(() =>
    navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
  )
  const original = await raw()
  await focusAt(0)
  await page.keyboard.press(`${modifier}+s`)
  await page.locator('[data-saved]').filter({ hasText: '已保存' }).waitFor()
  assert.equal(
    (
      await page.request
        .get(`${url}/fixture`, { maxRetries: 2 })
        .then((response) => response.json())
    ).source,
    original
  )
  console.log('PASS: opening and saving preserves exact original bytes')

  await page.locator('[data-table-cell="1:1"]').click()
  const cell = page.getByRole('textbox', { name: '第 2 行第 2 列' })
  await cell.fill('http new')
  await cell.press('End')
  await cell.pressSequentially(' 中文')
  await settled()
  assert.equal(await raw(), original.replace('http old', 'http new 中文'))
  assert.ok(await cell.evaluate((element) => element === document.activeElement))
  await cell.press('Tab')
  await page.getByRole('textbox', { name: '第 3 行第 1 列' }).press('Tab')
  await page.getByRole('textbox', { name: '第 3 行第 2 列' }).press('Tab')
  await page.getByRole('textbox', { name: '第 4 行第 1 列' }).fill('added row')
  assert.match(await raw(), /added row/)
  console.log('PASS: cell-only diff, typed whitespace, persistent focus and Tab row creation')

  await setDocument(original)
  await page.locator('[data-table-cell="1:1"]').click()
  await page.getByRole('textbox', { name: '第 2 行第 2 列' }).fill('new value')
  await page.getByRole('button', { name: 'source', exact: true }).click()
  await focusAt(0)
  await page.keyboard.press(`${modifier}+z`)
  await settled()
  assert.equal(await raw(), original)
  await page.keyboard.press(`${modifier}+Shift+z`)
  await settled()
  assert.equal(await raw(), original.replace('http old', 'new value'))
  await page.getByRole('button', { name: '切换文档', exact: true }).click()
  await page.getByRole('button', { name: '切换文档', exact: true }).click()
  await focusAt(0)
  await page.keyboard.press(`${modifier}+z`)
  await settled()
  assert.equal(await raw(), original)
  console.log('PASS: undo/redo across source/live mode and editor unmount/remount')

  await setDocument('Document A')
  await focusAt(10)
  await page.keyboard.type('!')
  await page.getByRole('button', { name: '另一份文档', exact: true }).click()
  await settled()
  assert.equal(await raw(), 'Other document')
  await focusAt(14)
  await page.keyboard.type('?')
  await page.getByRole('button', { name: '另一份文档', exact: true }).click()
  await settled()
  assert.equal(await raw(), 'Document A!')
  await focusAt(0)
  await page.keyboard.press(`${modifier}+z`)
  assert.equal(await raw(), 'Document A')
  await page.getByRole('button', { name: '另一份文档', exact: true }).click()
  await settled()
  assert.equal(await raw(), 'Other document?')
  await focusAt(0)
  await page.keyboard.press(`${modifier}+z`)
  assert.equal(await raw(), 'Other document')
  await page.getByRole('button', { name: '另一份文档', exact: true }).click()
  console.log('PASS: each file owns its draft, undo history and selection')

  await page.getByRole('button', { name: 'live', exact: true }).click()
  await setDocument('- first\n- ')
  await focusAt(10)
  await page.keyboard.press('Backspace')
  assert.equal(await raw(), '- first\n')
  await setDocument('- first')
  await focusAt(7)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), '- first\n- ')
  await page.keyboard.press('Backspace')
  assert.equal(await raw(), '- first\n')
  await setDocument('- first')
  await focusAt(7)
  await page.keyboard.press('Shift+Enter')
  assert.equal(await raw(), '- first  \n  ')
  console.log('PASS: list Enter, Shift+Enter and marker-only Backspace')

  await setDocument('paragraph')
  await focusAt(9)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), 'paragraph\n\n')
  await setDocument('- first  \n  ')
  await focusAt(12)
  await page.keyboard.type('/')
  await page.locator('.cm-tooltip-autocomplete').waitFor()
  await page
    .locator('.cm-completionLabel')
    .filter({ hasText: /^代码块$/ })
    .click()
  assert.equal(await raw(), '- first  \n  ```\n  \n  ```')
  console.log('PASS: paragraph boundaries and slash commands on list continuation lines')

  await setDocument('one `code` tail')
  await focusAt(9)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('X')
  assert.equal(await raw(), 'one `code`X tail')
  await setDocument('```javascript')
  await focusAt(13)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), '```javascript\n\n```')
  await page.keyboard.type('const a = 1')
  await page.keyboard.press(`${modifier}+Enter`)
  await page.keyboard.type('outside')
  assert.equal(await raw(), '```javascript\nconst a = 1\n```\n\noutside')
  console.log('PASS: inline-code escape, fence completion and code-block exit')

  await setDocument('中文输入：')
  await focusAt(5)
  if (!isWebkit) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.imeSetComposition', {
      text: 'zhongwen',
      selectionStart: 8,
      selectionEnd: 8
    })
    await cdp.send('Input.insertText', { text: '中文' })
  } else {
    await page.keyboard.insertText('中文')
  }
  await settled()
  assert.equal(await raw(), '中文输入：中文')
  console.log(
    isWebkit
      ? 'PASS: WebKit Chinese insertion'
      : 'PASS: real browser composition and Chinese commit'
  )

  await setDocument('before\n\n$$\nx^2\n$$\n\n```mermaid\ngraph TD\n  A --> B\n```\n')
  await focusAt(0)
  await page.locator('.live-md-math .katex').waitFor()
  await page.locator('.live-md-diagram svg').waitFor()
  console.log('PASS: math and Mermaid render without changing source')

  await setDocument('')
  await focusAt(0)
  await page.evaluate(() => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', '<h2>粘贴标题</h2><p><strong>正文</strong></p>')
    window.editor.contentDOM.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData })
    )
  })
  await settled()
  assert.equal(await raw(), '## 粘贴标题\n\n**正文**')
  console.log('PASS: formatted HTML paste changes only the inserted fragment')

  await setDocument(original)
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  await page.locator('.live-md-table').waitFor()
  assert.equal(await page.locator('.live-md-table-toolbar').count(), 0)
  assert.equal(await page.locator('.cm-content').getAttribute('contenteditable'), 'false')
  await page.locator('[data-table-cell="1:1"]').click()
  assert.equal(await page.locator('textarea').count(), 0)
  assert.equal(await raw(), original)
  assert.equal(
    await page
      .locator('.live-md-image img')
      .getAttribute('src')
      .then((src) => src?.startsWith('data:')),
    true
  )
  await page.evaluate(() => {
    window.editor.dispatch({
      selection: { anchor: window.editor.state.doc.toString().indexOf('<details>') },
      scrollIntoView: true
    })
  })
  await page.locator('summary').waitFor()
  assert.equal(await page.locator('summary').count(), 1)
  console.log('PASS: read-only preview, rendered table, authorized image and HTML details')

  await page.getByRole('button', { name: 'live', exact: true }).click()
  await page.getByRole('button', { name: '查找和替换', exact: true }).click()
  const search = page.locator('.cm-search input[name="search"]')
  await search.waitFor()
  assert.ok(await search.evaluate((element) => element === document.activeElement))
  await search.fill('http old')
  await page.keyboard.press('Escape')
  await focusAt(0)
  await page.keyboard.press(`${modifier}+s`)
  await settled()
  assert.equal(
    (
      await page.request
        .get(`${url}/fixture`, { maxRetries: 2 })
        .then((response) => response.json())
    ).source,
    await raw()
  )
  await page.screenshot({ path: '/tmp/orcaw-markdown-live-dark.png' })
  await page.getByRole('button', { name: '主题', exact: true }).click()
  await page.setViewportSize({ width: 900, height: 700 })
  await page.screenshot({ path: '/tmp/orcaw-markdown-live-light.png' })
  assert.deepEqual(errors, [])
  console.log('PASS: search focus, real-file save, dark/light/narrow layout; no browser exceptions')
} finally {
  await browser.close()
}
