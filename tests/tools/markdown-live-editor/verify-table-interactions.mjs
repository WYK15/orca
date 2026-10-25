import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const isWebkit = process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
const url = process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181'
const browser = await (isWebkit
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
page.setDefaultNavigationTimeout(30000)
const errors = []
let initialFixture
page.on('pageerror', (error) => errors.push(error.message))
const raw = () => page.evaluate(() => window.raw)
const pause = () => page.waitForTimeout(80)
const setDocument = async (source) => {
  await page.evaluate((value) => window.setDocument(value), source)
  await pause()
}
const focusAt = async (anchor) =>
  page.evaluate((position) => {
    window.editor.dispatch({ selection: { anchor: position } })
    window.editor.focus()
  }, anchor)
const cell = (row, column) =>
  page.getByRole('textbox', { name: `第 ${row + 1} 行第 ${column + 1} 列` })
const contextAction = async (row, column, label) => {
  await page.locator(`[data-table-cell="${row}:${column}"]`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: label, exact: true }).click()
  await pause()
}
const source =
  'Before ->\r\n\r\n|  A    | B      |\r\n| :---- | -----: |\r\n| x     | y      |\r\n| z     | q      |\r\n\r\nAfter &gt;'
const addedColumn = source
  .replace('| B', '|  | B')
  .replace('| -----:', '| --- | -----:')
  .replace('| y', '|  | y')
  .replace('| q', '|  | q')

try {
  initialFixture = (
    await page.request.get(`${url}/fixture`, { maxRetries: 2 }).then((response) => response.json())
  ).source
  await page.goto(url)
  await page.locator('.cm-content').waitFor()
  const modifier = await page.evaluate(() =>
    navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
  )
  for (let level = 1; level <= 6; level++) {
    await setDocument('')
    await focusAt(0)
    for (let index = 0; index < level; index++) {
      await page.keyboard.type('#')
      assert.equal(await page.locator('.live-md-heading').count(), 0)
      assert.equal(await page.locator('.cm-content').textContent(), '#'.repeat(index + 1))
    }
    await page.keyboard.type(' ')
    assert.equal(await page.locator(`.live-md-h${level}`).count(), 0)
    await page.keyboard.insertText('标题')
    assert.equal(await page.locator(`.live-md-h${level}`).count(), 1)
    assert.equal(await raw(), `${'#'.repeat(level)} 标题`)
  }
  console.log('PASS: all six heading levels wait for heading content without swallowing hashes')

  await page.setViewportSize({ width: 1280, height: 360 })
  await setDocument(source)
  await page.locator('[data-table-cell="1:1"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除当前列', exact: true }).waitFor()
  await page.waitForTimeout(400)
  assert.equal(await raw(), source)
  assert.equal(await page.getByRole('menu').count(), 1)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1280, height: 900 })
  console.log(
    'PASS: a context menu near the viewport edge never edits a table on right-button release'
  )

  await setDocument(source)
  await page.locator('[data-table-cell="0:0"]').click()
  await contextAction(2, 1, '在下方插入行')
  assert.equal(await raw(), source.replace('| z     | q      |', '| z     | q      |\r\n|   |   |'))
  await cell(3, 1).waitFor()
  assert.ok(await cell(3, 1).evaluate((element) => element === document.activeElement))
  await cell(3, 1).fill('new row')
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), source)
  await cell(0, 0).waitFor()
  await page.keyboard.press(`${modifier}+Shift+z`)
  await pause()
  assert.match(await raw(), /\|   \|   \|/)
  console.log('PASS: right-click targets the clicked cell, preserves focus, and shares undo/redo')

  for (const [label, row, column, expected] of [
    [
      '在上方插入行',
      0,
      1,
      source
        .replace('|  A    | B      |', '|   |   |')
        .replace('| :---- | -----: |', '| :---- | -----: |\r\n|  A    | B      |')
    ],
    ['在上方插入行', 1, 1, source.replace('| x     | y      |', '|   |   |\r\n| x     | y      |')],
    ['在左侧插入列', 1, 1, addedColumn],
    ['在右侧插入列', 1, 0, addedColumn],
    ['删除当前行', 1, 1, source.replace('| x     | y      |\r\n', '')],
    [
      '删除当前行',
      0,
      1,
      source
        .replace('|  A    | B      |', '| x     | y      |')
        .replace('| x     | y      |\r\n| z', '| z')
    ],
    [
      '删除当前列',
      1,
      1,
      source
        .replace(' B      |', '')
        .replace(' -----: |', '')
        .replace(' y      |', '')
        .replace(' q      |', '')
    ],
    ['清空当前行', 1, 1, source.replace('| x     | y      |', '|      |       |')],
    [
      '清空当前列',
      1,
      1,
      source
        .replace(' B      |', '       |')
        .replace(' y      |', '       |')
        .replace(' q      |', '       |')
    ],
    ['当前列居中对齐', 1, 1, source.replace('-----:', ':---:')]
  ]) {
    await setDocument(source)
    await page.locator('[data-table-cell="0:0"]').click()
    await contextAction(row, column, label)
    assert.equal(await page.locator('.live-md-table').count(), 1, label)
    assert.equal(await raw(), expected, label)
    await page.keyboard.press(`${modifier}+z`)
    await pause()
    assert.equal(await raw(), source, `${label}: undo`)
    await page.keyboard.press(`${modifier}+Shift+z`)
    await pause()
    assert.equal(await raw(), expected, `${label}: redo`)
  }
  console.log(
    'PASS: insert/delete/clear rows and columns, alignment, exact source and one-step undo'
  )

  await setDocument(source)
  await page.locator('[data-table-cell="1:1"]').click()
  await cell(1, 1).fill('save from table')
  await page.keyboard.press(`${modifier}+s`)
  await page.locator('[data-saved]').filter({ hasText: '已保存' }).waitFor()
  assert.equal(
    (
      await page.request
        .get(`${url}/fixture`, { maxRetries: 2 })
        .then((response) => response.json())
    ).source,
    await raw()
  )
  await page.keyboard.press(`${modifier}+Enter`)
  await cell(2, 1).fill('inserted with shortcut')
  assert.match(await raw(), /inserted with shortcut/)
  await page.keyboard.press(`${modifier}+Shift+Backspace`)
  await pause()
  assert.doesNotMatch(await raw(), /inserted with shortcut/)
  await cell(2, 1).waitFor()
  console.log(
    'PASS: save works inside cells; modifier+Enter inserts a row and modifier+Shift+Backspace deletes it'
  )

  await setDocument(source)
  await page.locator('[data-table-cell="1:1"]').click()
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
  await pause()
  assert.equal(await raw(), source.replace('y      |', 'y中文      |'))
  assert.ok(await cell(1, 1).evaluate((element) => element === document.activeElement))
  console.log(
    isWebkit
      ? 'PASS: WebKit Chinese insertion in table cells'
      : 'PASS: Chinese IME composition retains table-cell focus without duplicate text'
  )

  await setDocument(source)
  await page.locator('[data-table-cell="1:1"]').click()
  await cell(1, 1).evaluate((element) => element.setSelectionRange(0, 0))
  await cell(1, 1).press('ArrowLeft')
  await cell(1, 0).waitFor()
  await cell(1, 0).evaluate((element) =>
    element.setSelectionRange(element.value.length, element.value.length)
  )
  await cell(1, 0).press('ArrowRight')
  await cell(1, 1).waitFor()
  await cell(1, 1).press('ArrowDown')
  await cell(2, 1).waitFor()
  await cell(2, 1).press('ArrowUp')
  await cell(1, 1).waitFor()
  await cell(1, 1).press('Shift+Enter')
  await page.keyboard.insertText('第二行')
  assert.match(await raw(), /<br>第二行/)
  await page.keyboard.press('Escape')
  assert.ok(
    await page.locator('.cm-content').evaluate((element) => element === document.activeElement)
  )
  console.log(
    'PASS: arrow-key cell navigation, Shift+Enter line breaks and Escape return focus correctly'
  )

  await setDocument('| A | B | C |\n| - | - | - |\n| x |')
  await page.locator('[data-table-cell="1:2"]').click()
  await cell(1, 2).fill('missing cell')
  assert.equal(await raw(), '| A | B | C |\n| - | - | - |\n| x |  |  missing cell|')
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), '| A | B | C |\n| - | - | - |\n| x |')
  console.log(
    'PASS: missing trailing cells remain editable and undo restores the short original row'
  )

  await setDocument(source)
  await contextAction(1, 1, '删除表格')
  assert.equal(await page.locator('.live-md-table').count(), 0)
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), source)
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  await page.locator('[data-table-cell="1:1"]').click({ button: 'right' })
  assert.equal(await page.getByRole('menuitem', { name: '删除当前行' }).count(), 0)
  assert.equal(await raw(), source)
  console.log(
    'PASS: deleting a whole table is undoable and read-only preview exposes no editing menu'
  )
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: '/tmp/orcaw-markdown-table-failure.png' })
  throw error
} finally {
  if (typeof initialFixture === 'string') {
    await page.request.post(`${url}/fixture`, { data: initialFixture, maxRetries: 2 })
  }
  await browser.close()
}
