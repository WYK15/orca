# Browser Title Event Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep browser-tab labels stable when `page-title-updated` carries a transient title that no longer matches the WebView's current title.

**Architecture:** Add a focused resolver that treats the event as a notification and reads the WebView's current title as the source of truth. `BrowserPane` passes the resolved title through its existing display normalization and uses the same value for browser state and history.

**Tech Stack:** TypeScript, React, Electron WebView, Vitest

## Global Constraints

- Do not change CSS, tab width rules, or layout behavior.
- Do not add Pi-specific title matching.
- Preserve normal dynamic browser titles by falling back to the event payload when the current title is empty or temporarily unreadable.
- Keep browser state and browser history on the same resolved title.
- Preserve macOS, Linux, Windows, SSH, and folder-workspace behavior.
- Do not add a `max-lines` disable or per-file limit override.
- Leave unrelated worktree changes untouched.

---

### Task 1: Resolve Browser Title Events From Current WebView State

**Files:**
- Create: `src/renderer/src/components/browser-pane/browser-page-title-event.ts`
- Create: `src/renderer/src/components/browser-pane/browser-page-title-event.test.ts`
- Modify: `src/renderer/src/components/browser-pane/BrowserPane.tsx:3908-3914`

**Interfaces:**
- Consumes: `event.title: string | undefined` and `() => webview.getTitle()`.
- Produces: `resolveBrowserPageTitleEvent(eventTitle: string | undefined, readCurrentTitle: () => string): string | undefined`.

- [ ] **Step 1: Write the failing resolver tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolveBrowserPageTitleEvent } from './browser-page-title-event'

describe('browser page title events', () => {
  it('uses the current WebView title instead of a transient event title', () => {
    expect(
      resolveBrowserPageTitleEvent('⠋ π - pi-web', () => 'pi-kit - Pi Web')
    ).toBe('pi-kit - Pi Web')
  })

  it('falls back to the event title when the current WebView title is empty', () => {
    expect(resolveBrowserPageTitleEvent('Example', () => '')).toBe('Example')
  })

  it('falls back to the event title when the current WebView title is unavailable', () => {
    expect(
      resolveBrowserPageTitleEvent('Example', () => {
        throw new Error('guest not attached')
      })
    ).toBe('Example')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
corepack pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/browser-pane/browser-page-title-event.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because `browser-page-title-event.ts` does not exist.

- [ ] **Step 3: Add the minimal resolver**

```ts
export function resolveBrowserPageTitleEvent(
  eventTitle: string | undefined,
  readCurrentTitle: () => string
): string | undefined {
  try {
    return readCurrentTitle() || eventTitle
  } catch {
    return eventTitle
  }
}
```

- [ ] **Step 4: Use the resolver at the BrowserPane event boundary**

Import `resolveBrowserPageTitleEvent` from `./browser-page-title-event`, then update the handler:

```ts
const title = getBrowserDisplayTitle(
  resolveBrowserPageTitleEvent(event.title, () => webview.getTitle()),
  browserModelUrl
)
onUpdatePageStateRef.current(browserTab.id, { title })
addBrowserHistoryEntryRef.current(browserModelUrl, title)
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
corepack pnpm vitest run --config config/vitest.config.ts \
  src/renderer/src/components/browser-pane/browser-page-title-event.test.ts \
  src/renderer/src/components/browser-pane/BrowserPane.webview-preferences.test.ts \
  src/renderer/src/components/tab-bar/BrowserTab.test.tsx \
  src/renderer/src/store/slices/browser.test.ts \
  --pool=threads \
  --maxWorkers=1
```

Expected: all selected tests pass.

- [ ] **Step 6: Run static verification**

Run:

```bash
corepack pnpm exec oxlint \
  src/renderer/src/components/browser-pane/browser-page-title-event.ts \
  src/renderer/src/components/browser-pane/browser-page-title-event.test.ts \
  src/renderer/src/components/browser-pane/BrowserPane.tsx
corepack pnpm exec oxfmt --check \
  src/renderer/src/components/browser-pane/browser-page-title-event.ts \
  src/renderer/src/components/browser-pane/browser-page-title-event.test.ts \
  src/renderer/src/components/browser-pane/BrowserPane.tsx
corepack pnpm run typecheck:web
git diff --check
```

Expected: lint, formatting, web type checking, and whitespace checks pass.

- [ ] **Step 7: Commit the verified fix**

```bash
git add \
  src/renderer/src/components/browser-pane/browser-page-title-event.ts \
  src/renderer/src/components/browser-pane/browser-page-title-event.test.ts \
  src/renderer/src/components/browser-pane/BrowserPane.tsx
git commit -m "fix(browser): ignore stale title events"
```

