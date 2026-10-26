import assert from 'node:assert/strict'
import { chromium, webkit } from 'playwright'

const browser = await (process.env.ORCA_MARKDOWN_CHECK_BROWSER === 'webkit'
  ? webkit.launch({ headless: true })
  : chromium.launch({ channel: 'chrome', headless: true }))
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
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
    (selection) => {
      window.editor.dispatch({ selection })
      window.editor.focus()
    },
    { anchor, head }
  )
  await pause()
}

try {
  await page.goto(process.env.ORCA_MARKDOWN_CHECK_URL || 'http://127.0.0.1:4181')
  await page.locator('.cm-content').waitFor()
  const modifier = await page.evaluate(() =>
    navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'
  )
  const original = '1. alpha\n2. bravo\n3. charlie'
  const afterEnter = '1. alpha\n2. \n3. bravo\n4. charlie'
  const continuation = '1. alpha\n\n   \n2. bravo\n3. charlie'
  await doc(original)
  await select(8)
  await page.keyboard.press('Enter')
  assert.equal(await raw(), afterEnter)
  await page.keyboard.press('Backspace')
  assert.equal(await raw(), continuation)
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), afterEnter)
  await page.keyboard.press(`${modifier}+Shift+z`)
  await pause()
  assert.equal(await raw(), continuation)
  await page.keyboard.type('continued')
  assert.equal(await raw(), continuation.replace('   \n', '   continued\n'))
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  assert.deepEqual(await page.locator('.live-md-list-marker').allTextContents(), ['1.', '2.', '3.'])
  await page.getByRole('button', { name: 'live', exact: true }).click()
  console.log(
    'PASS: Enter then Backspace continues the preceding item and atomically renumbers following items'
  )

  const mixed = 'Before ->\r\n\r\n1. alpha\r\n2. bravo\r\n3. charlie\r\n\r\nAfter &gt;\n'
  await doc(mixed)
  const from = mixed.replaceAll('\r\n', '\n').indexOf('2. bravo')
  await select(from, from + '2. bravo\n'.length)
  await page.keyboard.press('Backspace')
  assert.equal(await raw(), mixed.replace('2. bravo\r\n', '').replace('3. charlie', '2. charlie'))
  await page.keyboard.press(`${modifier}+z`)
  await pause()
  assert.equal(await raw(), mixed)
  console.log(
    'PASS: deleting a selected list item renumbers only its siblings and undo restores mixed line endings exactly'
  )

  for (const [source, expected] of [
    ['- first\n- ', '- first\n\n  '],
    ['- parent\n  - first\n  - ', '- parent\n  - first\n\n    '],
    ['> 1. first\n> 2. ', '> 1. first\n>\n>    '],
    ['- [x] first\n- [ ] ', '- [x] first\n\n  '],
    ['9. first\n10. ', '9. first\n\n   ']
  ]) {
    await doc(source)
    await select(source.length)
    await page.keyboard.press('Backspace')
    assert.equal(await raw(), expected)
    await page.keyboard.type('continued')
    assert.equal(await raw(), `${expected}continued`)
  }
  console.log(
    'PASS: empty unordered, nested, quoted, task and multi-digit list items retain continuation indentation'
  )

  await doc('1. a\n2. b\n3. c')
  await select(5, 6)
  await page.keyboard.type('8')
  assert.equal(await raw(), '1. a\n8. b\n3. c')
  console.log('PASS: explicitly editing a source number preserves the other source markers')

  await doc('1. a\n1. b\n1. c')
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  assert.deepEqual(await page.locator('.live-md-list-marker').allTextContents(), ['1.', '2.', '3.'])
  assert.equal(await raw(), '1. a\n1. b\n1. c')
  await page.getByRole('button', { name: 'live', exact: true }).click()
  await select(5, 10)
  await page.keyboard.press('Delete')
  assert.equal(await raw(), '1. a\n1. c')
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  assert.deepEqual(await page.locator('.live-md-list-marker').allTextContents(), ['1.', '2.'])
  await page.getByRole('button', { name: 'source', exact: true }).click()
  await doc(original)
  await select(9, 18)
  await page.keyboard.press('Backspace')
  assert.equal(await raw(), '1. alpha\n3. charlie')
  console.log(
    'PASS: repeated source markers render consecutive ordinals while source-mode deletion remains literal'
  )
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
