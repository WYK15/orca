# Browser Title Stability Manual Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic loopback test page for the transient browser-title event and produce a fixed unpacked Windows executable for sequential comparison.

**Architecture:** A small ES module emits a transient spinner title followed synchronously by the stable title. A standalone HTML page drives that module and displays controls and counters. A zero-dependency Node HTTP server exposes only the fixture assets and the canonical Geist font on `127.0.0.1`.

**Tech Stack:** HTML, CSS, browser ES modules, Node.js `http`, Vitest, Electron Builder.

## Global Constraints

- Keep the fixture under `tests/manual/browser-title-stability/`; it must not ship in packaged application files.
- Bind to `127.0.0.1` by default and expose only allowlisted files.
- Use no third-party server dependency.
- Use the color, radius, and typography roles from `docs/STYLEGUIDE.md` and `src/renderer/src/assets/main.css`.
- Keep the transient and stable title assignments synchronous and consecutive.
- Build the fixed executable with the existing `build:unpack` script at `dist/win-unpacked/Orcaw.exe`.
- Do not stage or modify the unrelated `table-resize-demo.md`.

---

### Task 1: Deterministic title-cycle fixture

**Files:**
- Create: `tests/manual/browser-title-stability/browser-title-cycle.mjs`
- Create: `tests/manual/browser-title-stability/index.html`
- Create: `tests/tools/browser-title-stability/browser-title-cycle.test.mjs`

**Interfaces:**
- Produces: `STABLE_TITLE: string`
- Produces: `emitTransientTitlePair(documentObject: { title: string }, frameIndex: number): string`
- Consumes: a browser `document` or a test double with a `title` setter

- [ ] **Step 1: Write the failing title-cycle test**

```js
import { describe, expect, it } from 'vitest'
import {
  STABLE_TITLE,
  emitTransientTitlePair
} from '../../manual/browser-title-stability/browser-title-cycle.mjs'

describe('browser title cycle', () => {
  it('emits a transient spinner title before restoring the stable title', () => {
    const titles = []
    const documentObject = {
      set title(value) {
        titles.push(value)
      }
    }

    expect(emitTransientTitlePair(documentObject, 0)).toBe(STABLE_TITLE)
    expect(titles).toEqual(['⠋ π - title-jitter-test', STABLE_TITLE])
  })

  it('cycles spinner frames while always ending on the stable title', () => {
    const titles = []
    const documentObject = {
      set title(value) {
        titles.push(value)
      }
    }

    emitTransientTitlePair(documentObject, 1)
    emitTransientTitlePair(documentObject, 2)

    expect(titles).toEqual([
      '⠙ π - title-jitter-test',
      STABLE_TITLE,
      '⠹ π - title-jitter-test',
      STABLE_TITLE
    ])
  })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
corepack pnpm vitest run --config config/vitest.config.ts tests/tools/browser-title-stability/browser-title-cycle.test.mjs
```

Expected: FAIL because `browser-title-cycle.mjs` does not exist.

- [ ] **Step 3: Implement the title-cycle module**

```js
export const STABLE_TITLE = 'Orcaw title stability test'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function emitTransientTitlePair(documentObject, frameIndex) {
  const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]
  documentObject.title = `${frame} π - title-jitter-test`
  documentObject.title = STABLE_TITLE
  return STABLE_TITLE
}
```

- [ ] **Step 4: Build the standalone page**

Create this document structure and behavior; keep the CSS declarations in the same file because the page is an isolated manual fixture:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Orcaw title stability test</title>
    <style>
      @font-face {
        font-family: 'Geist';
        src: url('/assets/Geist-Variable.woff2') format('woff2');
        font-weight: 100 900;
        font-display: swap;
      }

      :root {
        color-scheme: light dark;
        --background: #fff;
        --foreground: #0a0a0a;
        --card: #fff;
        --muted: #f5f5f5;
        --muted-foreground: #737373;
        --primary: #171717;
        --primary-foreground: #fafafa;
        --border: #e5e5e5;
        --ring: #a1a1a1;
        --radius: 0.625rem;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --background: #0a0a0a;
          --foreground: #fafafa;
          --card: #171717;
          --muted: #262626;
          --muted-foreground: #a1a1a1;
          --primary: #e5e5e5;
          --primary-foreground: #171717;
          --border: rgb(255 255 255 / 0.07);
          --ring: #737373;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background: var(--background);
        color: var(--foreground);
        font-family: 'Geist', sans-serif;
        font-size: 14px;
        letter-spacing: 0.01em;
      }

      main {
        width: min(100%, 560px);
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: calc(var(--radius) * 1.4);
        background: var(--card);
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted-foreground);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.25;
      }

      p {
        line-height: 1.5;
      }

      section {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px 16px;
        margin: 24px 0;
        padding: 16px;
        border-radius: calc(var(--radius) * 0.8);
        background: var(--muted);
      }

      button {
        min-height: 36px;
        padding: 0 16px;
        border: 0;
        border-radius: calc(var(--radius) * 0.8);
        background: var(--primary);
        color: var(--primary-foreground);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }

      button:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Manual regression fixture</p>
      <h1>Browser title stability test</h1>
      <p>
        The page emits transient spinner titles. Movement in the Orcaw tab bar is the failure
        signal.
      </p>
      <section aria-label="Test status">
        <span>Status</span>
        <strong id="status" aria-live="polite">Running</strong>
        <span>Events</span>
        <strong id="event-count">0</strong>
      </section>
      <button id="toggle" type="button">Stop</button>
    </main>
    <script type="module">
      import { emitTransientTitlePair } from './browser-title-cycle.mjs'

      const intervalMilliseconds = 180
      const countElement = document.querySelector('#event-count')
      const statusElement = document.querySelector('#status')
      const toggleButton = document.querySelector('#toggle')
      let eventCount = 0
      let timer

      function tick() {
        emitTransientTitlePair(document, eventCount)
        eventCount += 1
        countElement.textContent = String(eventCount)
      }

      function start() {
        if (timer) return
        statusElement.textContent = 'Running'
        toggleButton.textContent = 'Stop'
        tick()
        timer = window.setInterval(tick, intervalMilliseconds)
      }

      function stop() {
        window.clearInterval(timer)
        timer = undefined
        statusElement.textContent = 'Stopped'
        toggleButton.textContent = 'Start'
      }

      toggleButton.addEventListener('click', () => (timer ? stop() : start()))
      start()
    </script>
  </body>
</html>
```

- [ ] **Step 5: Run the title-cycle test and confirm GREEN**

Run the Step 2 command.

Expected: 1 file and 2 tests pass.

- [ ] **Step 6: Commit the fixture**

```powershell
git add -- tests/manual/browser-title-stability/browser-title-cycle.mjs tests/manual/browser-title-stability/index.html tests/tools/browser-title-stability/browser-title-cycle.test.mjs
git commit -m "test(browser): add title stability fixture"
```

### Task 2: Loopback-only fixture server

**Files:**
- Create: `tests/manual/browser-title-stability/browser-title-stability-server.mjs`
- Create: `tests/tools/browser-title-stability/browser-title-stability-server.test.mjs`

**Interfaces:**
- Produces: `createBrowserTitleStabilityServer(): import('node:http').Server`
- Produces: `startBrowserTitleStabilityServer(options?: { host?: string, port?: number }): Promise<{ server: import('node:http').Server, url: string }>`
- Consumes: `index.html`, `browser-title-cycle.mjs`, and `src/renderer/src/assets/fonts/Geist-Variable.woff2`

- [ ] **Step 1: Write failing HTTP behavior tests**

```js
import { afterEach, describe, expect, it } from 'vitest'
import { startBrowserTitleStabilityServer } from '../../manual/browser-title-stability/browser-title-stability-server.mjs'

describe('browser title stability server', () => {
  let server

  afterEach(async () => {
    if (!server) return
    await new Promise((resolve) => server.close(resolve))
    server = undefined
  })

  it('serves the fixture over loopback', async () => {
    const started = await startBrowserTitleStabilityServer({ port: 0 })
    server = started.server

    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    const response = await fetch(started.url)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('Browser title stability test')
  })

  it('rejects files outside the allowlist', async () => {
    const started = await startBrowserTitleStabilityServer({ port: 0 })
    server = started.server

    expect((await fetch(`${started.url}package.json`)).status).toBe(404)
    expect((await fetch(`${started.url}../package.json`)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run the server test and confirm RED**

Run:

```powershell
corepack pnpm vitest run --config config/vitest.config.ts tests/tools/browser-title-stability/browser-title-stability-server.test.mjs
```

Expected: FAIL because `browser-title-stability-server.mjs` does not exist.

- [ ] **Step 3: Implement the allowlisted server**

Use `node:http`, `node:fs`, `node:path`, and `node:url`. The implementation has this shape:

```js
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixtureDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(fixtureDirectory, '..', '..', '..')

const assetPaths = new Map([
  ['/', { path: join(fixtureDirectory, 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/index.html', { path: join(fixtureDirectory, 'index.html'), type: 'text/html; charset=utf-8' }],
  [
    '/browser-title-cycle.mjs',
    { path: join(fixtureDirectory, 'browser-title-cycle.mjs'), type: 'text/javascript; charset=utf-8' }
  ],
  [
    '/assets/Geist-Variable.woff2',
    { path: join(repositoryRoot, 'src/renderer/src/assets/fonts/Geist-Variable.woff2'), type: 'font/woff2' }
  ]
])

export function createBrowserTitleStabilityServer() {
  return createServer(async (request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' })
      response.end('Method Not Allowed')
      return
    }

    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const asset = assetPaths.get(pathname)
    if (!asset) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }

    try {
      response.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store' })
      response.end(await readFile(asset.path))
    } catch (error) {
      console.error(error)
      response.writeHead(500)
      response.end('Fixture asset unavailable')
    }
  })
}

export async function startBrowserTitleStabilityServer({
  host = '127.0.0.1',
  port = Number(process.env.PORT ?? 4174)
} = {}) {
  const server = createBrowserTitleStabilityServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, host, resolveListen)
  })
  const address = server.address()
  return { server, url: `http://${host}:${address.port}/` }
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (entryPath === import.meta.url) {
  startBrowserTitleStabilityServer()
    .then(({ url }) => console.log(`Browser title stability fixture: ${url}`))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
```

Keep the response behavior shown above. Expand the entry-point output with the sequential old/fixed comparison instructions.

- [ ] **Step 4: Run both fixture tests and confirm GREEN**

```powershell
corepack pnpm vitest run --config config/vitest.config.ts tests/tools/browser-title-stability/browser-title-cycle.test.mjs tests/tools/browser-title-stability/browser-title-stability-server.test.mjs
```

Expected: 2 files and 5 tests pass.

- [ ] **Step 5: Start the service and smoke-test it**

Start the service in a hidden process, request `/`, `/browser-title-cycle.mjs`, and the font, then stop only the captured process. Confirm all three requests return 200 and `package.json` returns 404.

- [ ] **Step 6: Commit the server**

```powershell
git add -- tests/manual/browser-title-stability/browser-title-stability-server.mjs tests/tools/browser-title-stability/browser-title-stability-server.test.mjs
git commit -m "test(browser): serve title stability fixture"
```

### Task 3: Regression verification and unpacked Windows build

**Files:**
- Verify: `src/renderer/src/components/browser-pane/browser-page-title-event.test.ts`
- Verify: `src/renderer/src/components/browser-pane/BrowserPane.webview-preferences.test.ts`
- Produce: `dist/win-unpacked/Orcaw.exe`

**Interfaces:**
- Consumes: the fixture URL printed by Task 2
- Produces: a runnable fixed Windows application at the documented path

- [ ] **Step 1: Run the fixture and browser-title regression tests**

```powershell
corepack pnpm vitest run --config config/vitest.config.ts tests/tools/browser-title-stability/browser-title-cycle.test.mjs tests/tools/browser-title-stability/browser-title-stability-server.test.mjs src/renderer/src/components/browser-pane/browser-page-title-event.test.ts src/renderer/src/components/browser-pane/BrowserPane.webview-preferences.test.ts --pool=threads --maxWorkers=1
```

Expected: all selected files pass.

- [ ] **Step 2: Run static checks**

```powershell
corepack pnpm exec oxfmt --check tests/manual/browser-title-stability tests/tools/browser-title-stability
corepack pnpm run typecheck:web
git diff --check
```

Expected: each command exits with code 0.

- [ ] **Step 3: Build the unpacked Windows application**

```powershell
corepack pnpm run build:unpack
```

Expected: Electron Builder completes successfully and creates `dist/win-unpacked/Orcaw.exe`.

- [ ] **Step 4: Verify the build artifact**

```powershell
Get-Item -LiteralPath dist\win-unpacked\Orcaw.exe |
  Select-Object FullName, Length, LastWriteTime
Get-FileHash -LiteralPath dist\win-unpacked\Orcaw.exe -Algorithm SHA256
```

Expected: the executable exists, has a non-zero size, and has a SHA-256 digest.

- [ ] **Step 5: Record the sequential manual procedure**

Report:

1. Run `node tests/manual/browser-title-stability/browser-title-stability-server.mjs`.
2. Test the printed URL in installed `v1.4.165-wyk.4`; the tab bar should oscillate.
3. Close the old app.
4. Run `dist/win-unpacked/Orcaw.exe`.
5. Test the same URL; the event count should rise while the tab bar remains stable.

- [ ] **Step 6: Commit any final fixture corrections**

Stage only files under `tests/manual/browser-title-stability/`. Do not commit `dist/` or `table-resize-demo.md`.
