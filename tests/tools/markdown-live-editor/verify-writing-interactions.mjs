import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const url = process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181'
const isWebkit = process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
const browser = await (isWebkit
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
page.setDefaultNavigationTimeout(30000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const pause = () => page.waitForTimeout(90)
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
const paste = async (plain, html = '') => {
  await page.evaluate(
    ({ plain, html }) => {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', plain)
      if (html) {
        clipboardData.setData('text/html', html)
      }
      document.activeElement.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
      )
    },
    { plain, html }
  )
  await pause()
}
const copy = () =>
  page.evaluate(() => {
    const clipboardData = new DataTransfer()
    document.activeElement.dispatchEvent(
      new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true })
    )
    return { plain: clipboardData.getData('text/plain'), html: clipboardData.getData('text/html') }
  })
const cell = (row, column) =>
  page.getByRole('textbox', { name: `第 ${row + 1} 行第 ${column + 1} 列`, exact: true })

try {
  await page.goto(url)
  await page.locator('.cm-content').waitFor()
  const modifier = await page.evaluate(() =>
    navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
  )
  await doc('')
  await select(0)
  await page.keyboard.type('## ')
  assert.equal(await page.locator('.live-md-heading').count(), 0)
  await page.keyboard.type('h2')
  assert.equal(await page.locator('.live-md-h2').count(), 1)
  await select(3)
  assert.match(await page.locator('.cm-content').innerText(), /## h2/)
  console.log('PASS: heading text controls rendering and its source marker remains reachable')

  const paragraph = 'Before ->\r\n\r\nparagraph\r\n\r\nAfter &gt;'
  await doc(paragraph)
  await select(paragraph.replaceAll('\r\n', '\n').indexOf('paragraph') + 3)
  await page.getByRole('button', { name: '标题级别', exact: true }).click()
  await page.getByRole('menuitem', { name: '标题 2', exact: true }).click()
  await pause()
  assert.equal(await raw(), paragraph.replace('paragraph', '## paragraph'))
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), paragraph)
  await page.keyboard.press(`${modifier}+3`)
  assert.equal(await raw(), paragraph.replace('paragraph', '### paragraph'))
  await page.keyboard.press(`${modifier}+0`)
  assert.equal(await raw(), paragraph)
  console.log('PASS: heading menu and shortcuts convert the current paragraph with exact undo')

  await doc('**bold**')
  await select(2, 6)
  await page.getByRole('button', { name: '加粗', exact: true }).click()
  assert.equal(await raw(), 'bold')
  await page.keyboard.press(`${modifier}+b`)
  assert.equal(await raw(), '**bold**')
  await page.keyboard.press(`${modifier}+i`)
  assert.equal(await raw(), '***bold***')
  await select(0, 10)
  await page.keyboard.press(`${modifier}+Backslash`)
  assert.equal(await raw(), 'bold')
  console.log(
    'PASS: formatting toggles, nested emphasis and clear-format preserve the selected text'
  )

  await doc('word')
  await select(4)
  await page.keyboard.type('!')
  await select(0, 4)
  await page.keyboard.press(`${modifier}+b`)
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), 'word!')
  console.log('PASS: undoing a formatting command keeps the immediately preceding typing')

  await doc('- first\n- second\n  - child\n- third')
  await select(13)
  await page.keyboard.press('Tab')
  assert.equal(await raw(), '- first\n  - second\n    - child\n- third')
  await page.keyboard.press('Shift+Tab')
  assert.equal(await raw(), '- first\n- second\n  - child\n- third')
  console.log('PASS: list indentation moves the item together with its nested children')

  await doc('| A | B |')
  await select(9)
  await page.keyboard.press('Enter')
  await cell(1, 0).fill('created')
  assert.equal(await raw(), '| A | B |\n| --- | --- |\n|   created|   |')
  console.log('PASS: a typed table header creates the table and focuses its first body cell')

  const table = '| A | B |\n| --- | --- |\n| word | other |'
  await doc(table)
  await page.locator('[data-table-cell="1:0"]').click()
  await cell(1, 0).evaluate((element) => element.setSelectionRange(0, 4))
  await page.getByRole('button', { name: '加粗', exact: true }).click()
  await pause()
  assert.equal(await raw(), table.replace('word', '**word**'))
  assert.ok(await cell(1, 0).evaluate((element) => element === document.activeElement))
  await page.keyboard.press(`${modifier}+b`)
  await pause()
  assert.equal(await raw(), table)
  console.log('PASS: toolbar and keyboard formatting use the real table-cell selection')

  await cell(1, 0).fill('typed')
  await cell(1, 0).evaluate((element) => element.setSelectionRange(0, 5))
  await page.keyboard.press(`${modifier}+b`)
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), table.replace('word', 'typed'))
  await page.evaluate(() => {
    const element = document.querySelector('textarea')
    element.setSelectionRange(0, element.value.length)
    element.dispatchEvent(
      new ClipboardEvent('cut', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true
      })
    )
  })
  assert.equal(await raw(), table.replace('word', ''))
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), table.replace('word', 'typed'))
  await doc(table)
  console.log('PASS: table formatting and cut are separate undo steps from earlier typing')

  await page.locator('[data-table-cell="1:1"]').click()
  await paste('one\ttwo\nthree\tfour')
  assert.match(await raw(), /one/)
  assert.equal(await page.locator('[data-table-cell="2:2"]').textContent(), 'four')
  assert.equal(await page.locator('[data-table-cell="1:2"]').textContent(), 'two')
  assert.match(await raw(), /\| word \|/)
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), table)
  console.log('PASS: spreadsheet paste expands rows and columns and reverses in one undo')

  const across = `before\n\n${table}\n\nafter`
  await doc(across)
  await select(0, across.length)
  assert.equal(await page.locator('.live-md-table').count(), 1)
  assert.equal(await page.locator('[data-source-selected="true"]').count(), 4)
  const fullCopy = await copy()
  assert.match(fullCopy.plain, /before/)
  assert.match(fullCopy.plain, /word\tother/)
  assert.doesNotMatch(fullCopy.plain, /\| ---/)
  await page.evaluate(() => {
    window.editor.contentDOM.dispatchEvent(
      new ClipboardEvent('cut', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true
      })
    )
  })
  assert.equal(await raw(), '')
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), across)
  console.log('PASS: cross-block selection keeps tables rendered and shares copy/cut/undo')

  await doc('A **bold** word')
  await select(0, 15)
  const copied = await copy()
  assert.equal(copied.plain, 'A bold word')
  assert.match(copied.html, /<strong>bold<\/strong>/)
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.lastCopied = text
        }
      }
    })
  )
  await page.keyboard.press(`${modifier}+Shift+c`)
  await pause()
  assert.equal(await page.evaluate(() => window.lastCopied), 'A **bold** word')
  await page.getByRole('button', { name: 'source', exact: true }).click()
  await select(0, 15)
  assert.equal((await copy()).plain, 'A **bold** word')
  await page.getByRole('button', { name: 'live', exact: true }).click()
  await doc('')
  await select(0)
  await page.evaluate(
    (modifier) =>
      window.editor.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'v',
          shiftKey: true,
          metaKey: modifier === 'Meta',
          ctrlKey: modifier === 'Control'
        })
      ),
    modifier
  )
  await paste('plain **source**', '<p><strong>formatted</strong></p>')
  assert.equal(await raw(), 'plain **source**')
  console.log(
    'PASS: ordinary copy, copy as Markdown, source-mode copy and plain-text paste are distinct'
  )

  await doc('[reference][id]\n\n[id]: https://example.com\n\nwww.example.org')
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  await pause()
  await page.locator('.live-md-link').filter({ hasText: 'reference' }).click()
  assert.equal(await page.evaluate(() => window.lastLink), 'https://example.com')
  await page.locator('.live-md-link').filter({ hasText: 'www.example.org' }).click()
  assert.equal(await page.evaluate(() => window.lastLink), 'https://www.example.org')
  assert.doesNotMatch(await page.locator('.cm-content').innerText(), /\[id\]:/)
  console.log(
    'PASS: reference links and bare URLs render and open without exposing definitions in reading mode'
  )

  await page.getByRole('button', { name: 'live', exact: true }).click()
  await doc('')
  await select(0)
  await page.keyboard.type('(')
  assert.equal(await raw(), '()')
  await page.keyboard.press('Backspace')
  assert.equal(await raw(), '')
  await page.keyboard.type('[')
  await page.keyboard.type(']')
  assert.equal(await raw(), '[]')
  assert.deepEqual(errors, [])
  console.log(
    'PASS: bracket pairing, closing-character skipping and paired Backspace; no browser exceptions'
  )
} catch (error) {
  await page.screenshot({ path: '/tmp/orcaw-markdown-writing-failure.png' })
  throw error
} finally {
  await browser.close()
}
