import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

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
const load = async (text, anchor = text.length) => {
  await page.evaluate((source) => window.setDocument(source), text)
  await pause()
  await page.evaluate((position) => {
    window.editor.dispatch({ selection: { anchor: position } })
    window.editor.focus()
  }, anchor)
}

try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const mod = await page.evaluate(() => (navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'))
  for (const footer of ['', '\n2. bravo\n3. charlie']) {
    await load(`1. alpha${footer}`, 8)
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('```')
    await page.keyboard.press('Enter')
    await page.keyboard.type('x')
    const beforeExit = await raw()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    const expected = [
      '1. alpha  \n   ```\n   x\n   ```\n2. ',
      footer ? '\n3. bravo\n4. charlie' : ''
    ].join('')
    assert.equal(await raw(), expected)
    await page.keyboard.type('next')
    assert.equal(await raw(), expected.replace('\n2. ', '\n2. next'))
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), expected)
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), beforeExit)
  }
  console.log(
    'PASS: typing a fenced block after Shift+Enter, leaving its closing fence and pressing Enter resumes ordered numbering with exact undo'
  )

  const closed = '1. alpha\n   ```text\n   x\n   ```\n2. bravo'
  for (const detail of ['', 'detail']) {
    await load(closed, closed.indexOf('\n   x') + 5)
    await page.keyboard.press(`${mod}+Enter`)
    assert.equal(await raw(), closed.replace('```\n2.', '```\n\n   \n2.'))
    await page.keyboard.type(detail)
    await page.keyboard.press('Enter')
    const expected = detail
      ? closed.replace('```\n2.', '```\n\n   detail\n\n2. \n3.')
      : closed.replace('```\n2.', '```\n\n2. \n3.')
    assert.equal(await raw(), expected)
    await page.keyboard.type('next')
    assert.equal(await raw(), expected.replace('\n2. ', '\n2. next'))
  }
  console.log(
    'PASS: the code-exit shortcut retains list ownership for empty and filled paragraphs below a code block'
  )

  await load(closed, closed.indexOf('\n   x') + 5)
  await page.keyboard.type('z')
  const typedCode = await raw()
  await page.keyboard.press(`${mod}+Enter`)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), typedCode)
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), closed)
  console.log('PASS: undoing code exit preserves the immediately preceding code typing')

  for (const source of [
    '> 1. alpha\n>    ```text\n>    x\n>    ```\n> 2. bravo',
    '1. parent\n   1. alpha\n      ~~~text\n      x\n      ~~~\n   2. bravo\n2. outer'
  ]) {
    const closing = source.includes('~~~') ? '~~~' : '```'
    const anchor = source.lastIndexOf(closing) + 3
    await load(source, anchor)
    await page.keyboard.press('Enter')
    const prefix = source.startsWith('>') ? '> ' : '   '
    assert.equal(
      await raw(),
      `${source.slice(0, anchor)}\n${prefix}2. ${source.slice(anchor).replace(`${prefix}2. bravo`, `${prefix}3. bravo`)}`
    )
  }
  console.log(
    'PASS: quoted and nested lists continue at their own level after backtick or tilde fences'
  )

  await load(closed, closed.indexOf('\n   x') + 5)
  await page.keyboard.press('Enter')
  await page.keyboard.type('y')
  assert.equal(await raw(), closed.replace('   x\n', '   x\n   y\n'))
  await page.getByRole('button', { name: 'source', exact: true }).click()
  await load(closed, closed.lastIndexOf('```') + 3)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), closed.replace('```\n2.', '```\n   \n2.'))
  assert.deepEqual(errors, [])
  console.log(
    'PASS: Enter within code remains a code newline and source-mode Enter does not add list numbering'
  )
} finally {
  await browser.close()
}
