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
const pause = () => page.waitForTimeout(90)
const raw = () => page.evaluate(() => window.raw)
const load = async (source, anchor, head = anchor) => {
  await page.evaluate((text) => window.setDocument(text), source)
  await pause()
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
  const mod = await page.evaluate(() => (navigator.userAgent.includes('Mac') ? 'Meta' : 'Control'))
  for (const [source, expected] of [
    ['> alpha', '> alpha  \n> x'],
    ['> > alpha', '> > alpha  \n> > x'],
    ['```text\n- alpha\n```', '```text\n- alpha\nx\n```'],
    ['```text\n> alpha\n```', '```text\n> alpha\nx\n```'],
    ['```text\n    alpha\n```', '```text\n    alpha\n    x\n```'],
    [
      '1. before\n   ```text\n   alpha\n   ```\n2. after',
      '1. before\n   ```text\n   alpha\n   x\n   ```\n2. after'
    ],
    ['> ```text\n> alpha\n> ```', '> ```text\n> alpha\n> x\n> ```'],
    ['> ```text\n> > alpha\n> ```', '> ```text\n> > alpha\n> x\n> ```']
  ]) {
    await load(source, source.indexOf('alpha') + 5)
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('x')
    await pause()
    assert.equal(await raw(), expected)
  }
  console.log(
    'PASS: soft breaks preserve quote and code containers and never interpret literal code bullets or quotes'
  )

  for (const [source, at, expected] of [
    ['> ```text\n> alpha\n> ```', 'alpha', '> ```text\n> alpha\n> x\n> ```'],
    [
      '> 1. before\n>    ```text\n>    alpha\n>    ```',
      'alpha',
      '> 1. before\n>    ```text\n>    alpha\n>    x\n>    ```'
    ],
    ['```js\nconst alpha = {\n```', '{', '```js\nconst alpha = {\n  x\n```'],
    ['> ```js\n> const alpha = {\n> ```', '{', '> ```js\n> const alpha = {\n>   x\n> ```']
  ]) {
    await load(source, source.indexOf(at) + at.length)
    await page.keyboard.press('Enter')
    await page.keyboard.type('x')
    await pause()
    assert.equal(await raw(), expected)
  }
  console.log(
    'PASS: ordinary Enter keeps quoted code inside its container while JavaScript retains language indentation'
  )

  for (const [source, expected] of [
    ['1. alpha\n2. bravo\n3. charlie', 'alpha\n\n1. bravo\n2. charlie'],
    ['> 1. alpha\n> 2. bravo', '> alpha\n>\n> 1. bravo']
  ]) {
    await load(source, source.indexOf('alpha'))
    await page.keyboard.press('Backspace')
    assert.equal(await raw(), expected)
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), source)
  }
  console.log('PASS: unlisting the first item preserves the remaining list and its starting number')

  for (const [source, expected] of [
    ['1. alpha\n2. bravo\n3. charlie', '1. alpha\n\n   bravo\n2. charlie'],
    ['> 1. alpha\n> 2. bravo\n> 3. charlie', '> 1. alpha\n>\n>    bravo\n> 2. charlie'],
    ['- [x] alpha\n- [ ] bravo', '- [x] alpha\n\n  bravo']
  ]) {
    await load(source, source.indexOf('bravo'))
    await page.keyboard.press('Backspace')
    assert.equal(await raw(), expected)
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), source)
  }
  console.log(
    'PASS: Backspace on a nonempty item marker keeps its text in the preceding item and undo restores source'
  )

  for (const [source, outdent, expected] of [
    ['1. alpha\n2. bravo\n3. charlie', false, '1. alpha\n   1. bravo\n2. charlie'],
    [
      '1. alpha\n   1. bravo\n   2. child\n2. charlie',
      true,
      '1. alpha\n2. bravo\n   1. child\n3. charlie'
    ],
    ['9. alpha\n10. bravo\n11. charlie', false, '9. alpha\n   1. bravo\n10. charlie'],
    ['> 1. alpha\n> 2. bravo\n> 3. charlie', false, '> 1. alpha\n>    1. bravo\n> 2. charlie'],
    ['- alpha\n  1. bravo\n  2. child\n- charlie', true, '- alpha\n- bravo\n  1. child\n- charlie'],
    [
      '1. alpha\n   - bravo\n   - child\n2. charlie',
      true,
      '1. alpha\n2. bravo\n   - child\n3. charlie'
    ]
  ]) {
    await load(source, source.indexOf('bravo'))
    await page.keyboard.press(outdent ? 'Shift+Tab' : 'Tab')
    assert.equal(await raw(), expected)
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), source)
    await page.keyboard.press(`${mod}+Shift+z`)
    await pause()
    assert.equal(await raw(), expected)
  }
  console.log(
    'PASS: indentation maintains parent numbering, nested starts, quote prefixes and mixed list styles with exact history'
  )

  for (const [source, anchor, head, expected] of [
    ['1. alpha\n2. bravo', 4, 6, '1. a\n2. ha\n3. bravo'],
    ['1. alpha  \n   detail\n2. bravo', 16, 18, '1. alpha  \n   de\n2. il\n3. bravo'],
    ['1. alpha\n2. bravo\n3. charlie\n4. delta', 4, 22, '1. a\n2. harlie\n3. delta']
  ]) {
    await load(source, anchor, head)
    await page.keyboard.press('Enter')
    assert.equal(await raw(), expected)
    await page.keyboard.type('x')
    assert.equal(await raw(), expected.replace('\n2. ', '\n2. x'))
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), expected)
    await page.keyboard.press(`${mod}+z`)
    await pause()
    assert.equal(await raw(), source)
  }
  console.log(
    'PASS: Enter replaces a selection inside one or several list items while preserving the remaining text and numbering'
  )

  const pasteSource = 'Before ->\r\n\r\n1. alpha\r\n2. bravo\r\n\r\nAfter &gt;\n'
  await load(pasteSource, pasteSource.replaceAll('\r\n', '\n').indexOf('alpha') + 5)
  await page.locator('.cm-content').evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', ' one\ntwo')
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
    )
  })
  await pause()
  assert.equal(await raw(), pasteSource.replace('alpha', 'alpha one\r\ntwo'))
  await page.keyboard.press(`${mod}+z`)
  await pause()
  assert.equal(await raw(), pasteSource)
  console.log(
    'PASS: multiline plain paste retains unrelated source and undo restores exact mixed line endings'
  )
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: `/tmp/orcaw-container-editing-${browserName}-failure.png` })
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
