# Localized Menus and Safe Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize the reported Chinese menu actions and make unsigned macOS/Windows fork updates open the exact Release page while Linux retains automatic installation.

**Architecture:** Keep menu fixes in the Chinese i18next catalog. Stamp an explicit automatic-update capability into packaged metadata, read it through the existing updater-delivery policy, and let the Settings UI branch on the resulting `UpdateStatus.delivery` value. Release discovery remains shared and continues to target `WYK15/orca`.

**Tech Stack:** Electron, React, TypeScript, i18next, electron-builder, GitHub Actions, Vitest, Testing Library.

## Global Constraints

- Work only in the primary working directory; do not create or use another worktree.
- Preserve the user's untracked `tests/test.md`.
- Keep changes small and separated into localization, updater policy, and Settings behavior commits.
- Do not add max-lines disables or per-file max-lines increases.
- Use existing shadcn primitives, lucide icons, and design tokens; add no new visual tokens.
- Preserve macOS, Windows, Linux, SSH, and folder-workspace behavior outside update delivery.
- Keep release discovery scoped to `WYK15/orca`.
- Record the persistent unsigned-update policy in `FORK_NOTES.md`.

---

### Task 1: Chinese Menu Localization

**Files:**

- Create: `src/renderer/src/i18n/zh-menu-action-localization.test.ts`
- Modify: `src/renderer/src/i18n/locales/zh.json`

**Interfaces:**

- Consumes: Existing keys under `auto.components.editor.RichMarkdownTableToolbar` and `auto.components.right.sidebar.FileExplorerRow`.
- Produces: Chinese labels consumed by the existing `translate()` calls; no component API changes.

- [ ] **Step 1: Write the failing catalog test**

```ts
import { describe, expect, it } from 'vitest'
import zh from './locales/zh.json'

describe('Chinese menu action localization', () => {
  it('localizes rich Markdown table actions', () => {
    expect(zh.auto.components.editor.RichMarkdownTableToolbar).toEqual({
      insertRowAbove: '在上方插入行',
      insertRowBelow: '在下方插入行',
      deleteRow: '删除当前行',
      insertColumnLeft: '在左侧插入列',
      insertColumnRight: '在右侧插入列',
      deleteColumn: '删除当前列'
    })
  })

  it('distinguishes clipboard copy from duplicate', () => {
    const labels = zh.auto.components.right.sidebar.FileExplorerRow
    expect(labels['98a79948b3']).toBe('复制文件')
    expect(labels['0fec99bfd7']).toBe('创建副本')
    expect(labels['b5d436aa30']).toBe('复制路径')
    expect(labels['66a29dde82']).toBe('复制相对路径')
  })
})
```

- [ ] **Step 2: Run the test and verify the missing table catalog fails**

Run:

```bash
pnpm exec vitest run src/renderer/src/i18n/zh-menu-action-localization.test.ts
```

Expected: FAIL because `RichMarkdownTableToolbar` is missing and both file actions still equal `复制`.

- [ ] **Step 3: Add the confirmed Chinese labels**

Add this sibling of `RichMarkdownToolbar` in `zh.json`:

```json
"RichMarkdownTableToolbar": {
  "insertRowAbove": "在上方插入行",
  "insertRowBelow": "在下方插入行",
  "deleteRow": "删除当前行",
  "insertColumnLeft": "在左侧插入列",
  "insertColumnRight": "在右侧插入列",
  "deleteColumn": "删除当前列"
}
```

Change the two `FileExplorerRow` values:

```json
"0fec99bfd7": "创建副本",
"98a79948b3": "复制文件"
```

- [ ] **Step 4: Run localization verification**

Run:

```bash
pnpm exec vitest run src/renderer/src/i18n/zh-menu-action-localization.test.ts
pnpm run verify:localization-catalog
```

Expected: the focused test passes and catalog verification exits 0.

- [ ] **Step 5: Commit the localization fix**

```bash
git add src/renderer/src/i18n/zh-menu-action-localization.test.ts src/renderer/src/i18n/locales/zh.json
git commit -m "fix(i18n): localize Chinese editor menus"
```

---

### Task 2: Packaged Update Capability and Delivery Policy

**Files:**

- Modify: `config/electron-builder.config.cjs`
- Modify: `.github/workflows/fork-desktop-packages.yml`
- Modify: `config/scripts/electron-builder-product-identity.test.mjs`
- Modify: `config/scripts/fork-desktop-packages-workflow.test.mjs`
- Modify: `src/main/updater-delivery-policy.ts`
- Modify: `src/main/updater-delivery-policy.test.ts`
- Modify: `src/main/updater.ts`
- Modify: `src/main/updater-prerelease-feed.test.ts`

**Interfaces:**

- Produces: Packaged boolean metadata `orcawReleaseAutoUpdate`.
- Produces: `readPackagedReleaseAutoUpdateEnabled(appPath: string, platform: NodeJS.Platform): boolean`.
- Consumes: `getReleaseUpdateDelivery(platform, releaseAutoUpdateEnabled)` in `setupAutoUpdater()`.
- Preserves: Legacy `orcawMacAutoUpdate` metadata for already-built macOS packages.

- [ ] **Step 1: Write failing policy and version-discovery tests**

Update `updater-delivery-policy.test.ts` to assert:

```ts
expect(getReleaseUpdateDelivery('linux', false)).toBe('automatic')
expect(getReleaseUpdateDelivery('darwin', false)).toBe('manual')
expect(getReleaseUpdateDelivery('win32', false)).toBe('manual')
expect(getReleaseUpdateDelivery('darwin', true)).toBe('automatic')
expect(getReleaseUpdateDelivery('win32', true)).toBe('automatic')
```

Replace the metadata reader tests with fixtures proving:

```ts
function appPathWith(metadata: Record<string, unknown>): string {
  const appPath = mkdtempSync(join(tmpdir(), 'orcaw-update-policy-'))
  writeFileSync(join(appPath, 'package.json'), JSON.stringify(metadata))
  return appPath
}

expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({ orcawReleaseAutoUpdate: true }), 'win32')).toBe(true)
expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({ orcawReleaseAutoUpdate: false }), 'win32')).toBe(false)
expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({ orcawMacAutoUpdate: true }), 'darwin')).toBe(true)
expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({}), 'darwin')).toBe(false)
expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({}), 'win32')).toBe(false)
expect(readPackagedReleaseAutoUpdateEnabled(appPathWith({}), 'linux')).toBe(true)
```

Add this resolver case to `updater-prerelease-feed.test.ts`:

```ts
it('discovers the next Orcaw fork revision', async () => {
  respondWithAtom(['v1.4.165-wyk.5', 'v1.4.165-wyk.4'])
  const { fetchNewerReleaseTag } = await import('./updater-prerelease-feed')
  expect(
    await fetchNewerReleaseTag('1.4.165-wyk.4', { includePrerelease: true })
  ).toBe('v1.4.165-wyk.5')
})
```

- [ ] **Step 2: Run the policy tests and verify the Windows/manual contract fails**

Run:

```bash
pnpm exec vitest run src/main/updater-delivery-policy.test.ts src/main/updater-prerelease-feed.test.ts
```

Expected: FAIL because Windows currently defaults to automatic and the generic metadata reader does not exist.

- [ ] **Step 3: Write failing packaging contract tests**

Add `ORCA_RELEASE_AUTO_UPDATE` to `MUTABLE_BUILD_ENV` in `electron-builder-product-identity.test.mjs`. Assert:

```js
expect(config.extraMetadata).toMatchObject({
  orcawMacAutoUpdate: false,
  orcawReleaseAutoUpdate: false
})
```

and:

```js
withEnv({ ORCA_RELEASE_AUTO_UPDATE: '1' }, (config) => {
  expect(config.extraMetadata.orcawReleaseAutoUpdate).toBe(true)
})
```

In `fork-desktop-packages-workflow.test.mjs`, assert both Linux commands contain `ORCA_RELEASE_AUTO_UPDATE=1`, while Windows and macOS commands do not.

- [ ] **Step 4: Run packaging tests and verify metadata assertions fail**

Run:

```bash
pnpm exec vitest run config/scripts/electron-builder-product-identity.test.mjs config/scripts/fork-desktop-packages-workflow.test.mjs
```

Expected: FAIL because the metadata field and Linux environment flag are absent.

- [ ] **Step 5: Implement packaged capability metadata**

In `electron-builder.config.cjs`, derive:

```js
const releaseAutoUpdateEnabled =
  isMacRelease || process.env.ORCA_RELEASE_AUTO_UPDATE === '1'
```

and stamp:

```js
extraMetadata: {
  // existing version selection
  orcawMacAutoUpdate: isMacRelease,
  orcawReleaseAutoUpdate: releaseAutoUpdateEnabled
}
```

In the two Linux matrix commands, prefix electron-builder with:

```yaml
ORCA_RELEASE_AUTO_UPDATE=1 pnpm exec electron-builder
```

and:

```yaml
ORCA_RELEASE_AUTO_UPDATE=1 ORCA_LINUX_ARM64_RELEASE=1 pnpm exec electron-builder
```

Leave the unsigned Windows and macOS fork commands without the flag.

- [ ] **Step 6: Implement the fail-closed runtime policy**

Replace `readPackagedMacAutoUpdateEnabled` with:

```ts
export function readPackagedReleaseAutoUpdateEnabled(
  appPath: string,
  platform: NodeJS.Platform
): boolean {
  if (platform === 'linux') {
    return true
  }
  try {
    const metadata = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')) as {
      orcawMacAutoUpdate?: unknown
      orcawReleaseAutoUpdate?: unknown
    }
    if (typeof metadata.orcawReleaseAutoUpdate === 'boolean') {
      return metadata.orcawReleaseAutoUpdate
    }
    return platform === 'darwin' && metadata.orcawMacAutoUpdate === true
  } catch {
    return false
  }
}
```

Change delivery selection to:

```ts
export function getReleaseUpdateDelivery(
  platform: NodeJS.Platform,
  releaseAutoUpdateEnabled: boolean
): ReleaseUpdateDelivery {
  return platform === 'linux' || releaseAutoUpdateEnabled ? 'automatic' : 'manual'
}
```

In `setupAutoUpdater()`, call the new reader with `app.getAppPath()` and `process.platform`.

- [ ] **Step 7: Run the focused updater and packaging tests**

Run:

```bash
pnpm exec vitest run \
  src/main/updater-delivery-policy.test.ts \
  src/main/updater-prerelease-feed.test.ts \
  config/scripts/electron-builder-product-identity.test.mjs \
  config/scripts/fork-desktop-packages-workflow.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit the delivery-policy change**

```bash
git add \
  config/electron-builder.config.cjs \
  .github/workflows/fork-desktop-packages.yml \
  config/scripts/electron-builder-product-identity.test.mjs \
  config/scripts/fork-desktop-packages-workflow.test.mjs \
  src/main/updater-delivery-policy.ts \
  src/main/updater-delivery-policy.test.ts \
  src/main/updater.ts \
  src/main/updater-prerelease-feed.test.ts
git commit -m "fix(updater): route unsigned releases to downloads"
```

---

### Task 3: Settings Manual Download Behavior

**Files:**

- Create: `src/renderer/src/components/settings/GeneralUpdateSettingsSection.test.tsx`
- Modify: `src/renderer/src/components/settings/GeneralUpdateSettingsSection.tsx`
- Modify: `src/renderer/src/i18n/locales/en.json`
- Modify: `src/renderer/src/i18n/locales/zh.json`

**Interfaces:**

- Consumes: `UpdateStatus` with `state: 'available'`, optional `delivery: 'manual'`, and optional `releaseUrl`.
- Produces: A manual button that calls `window.api.shell.openUrl(exactReleaseUrl)` and an automatic button that calls `window.api.updater.download()`.

- [ ] **Step 1: Write the failing Settings interaction tests**

Create a happy-dom test with a mutable `useAppStore` mock, mocked sibling sections, and explicit window API spies:

```ts
// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralUpdateSettingsSection } from './GeneralUpdateSettingsSection'

const storeMock = vi.hoisted(() => ({
  state: {
    settingsSearchQuery: '',
    updateStatus: {
      state: 'idle'
    } as
      | { state: 'idle' }
      | {
          state: 'available'
          version: string
          delivery?: 'manual'
          releaseUrl?: string
        }
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeMock.state) => unknown) => selector(storeMock.state)
}))
vi.mock('./GeneralRemoteServerUpdates', () => ({
  GeneralRemoteServerUpdates: () => null
}))
vi.mock('./ReleaseChannelSection', () => ({
  ReleaseChannelSection: () => null
}))

const download = vi.fn(async () => undefined)
const openUrl = vi.fn(async () => undefined)
const getVersion = vi.fn(async () => '1.4.165-wyk.4')

beforeEach(() => {
  download.mockClear()
  openUrl.mockClear()
  getVersion.mockClear()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      shell: { openUrl },
      updater: {
        check: vi.fn(),
        download,
        getVersion,
        quitAndInstall: vi.fn(async () => undefined)
      }
    }
  })
})

describe('GeneralUpdateSettingsSection', () => {
  it('opens the exact release for manual delivery without starting a download', () => {
    storeMock.state.updateStatus = {
      state: 'available',
      version: '1.4.165-wyk.5',
      delivery: 'manual',
      releaseUrl: 'https://github.com/WYK15/orca/releases/tag/v1.4.165-wyk.5'
    }

    render(<GeneralUpdateSettingsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Download Page' }))

    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/WYK15/orca/releases/tag/v1.4.165-wyk.5'
    )
    expect(download).not.toHaveBeenCalled()
  })

  it('keeps automatic delivery on updater download IPC', () => {
    storeMock.state.updateStatus = {
      state: 'available',
      version: '1.4.165-wyk.5'
    }

    render(<GeneralUpdateSettingsSection />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Install Update (1.4.165-wyk.5)' })
    )

    expect(download).toHaveBeenCalledTimes(1)
    expect(openUrl).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the Settings test and verify the manual case fails**

Run:

```bash
pnpm exec vitest run src/renderer/src/components/settings/GeneralUpdateSettingsSection.test.tsx
```

Expected: FAIL because Settings always renders `Install Update` and calls download IPC.

- [ ] **Step 3: Implement the manual Settings branch**

Import `ExternalLink` from `lucide-react`. When `updateStatus.delivery === 'manual'`, render an `Open Download Page` button that calls:

```ts
void window.api.shell.openUrl(
  updateStatus.releaseUrl ?? getReleaseNotesUrlForVersion(updateStatus.version)
)
```

For automatic delivery, preserve the current `Download` icon, `Install Update` label, toast error, and updater download IPC.

Render manual status copy through:

```ts
translate(
  'auto.components.settings.GeneralUpdateSettingsSection.manualDownloadDescription',
  'Version {{value0}} is available. Download and install it from the release page.',
  { value0: updateStatus.version }
)
```

Add English and Chinese catalog entries:

```json
"openDownloadPage": "Open Download Page",
"manualDownloadDescription": "Version {{value0}} is available. Download and install it from the release page."
```

```json
"openDownloadPage": "打开下载页面",
"manualDownloadDescription": "版本 {{value0}} 已发布。请从 Release 页面下载并手动安装。"
```

- [ ] **Step 4: Run Settings and localization tests**

Run:

```bash
pnpm exec vitest run \
  src/renderer/src/components/settings/GeneralUpdateSettingsSection.test.tsx \
  src/renderer/src/i18n/zh-menu-action-localization.test.ts
pnpm run verify:localization-catalog
```

Expected: both focused tests pass and catalog verification exits 0.

- [ ] **Step 5: Commit the Settings behavior**

```bash
git add \
  src/renderer/src/components/settings/GeneralUpdateSettingsSection.test.tsx \
  src/renderer/src/components/settings/GeneralUpdateSettingsSection.tsx \
  src/renderer/src/i18n/locales/en.json \
  src/renderer/src/i18n/locales/zh.json
git commit -m "fix(settings): open manual update downloads"
```

---

### Task 4: Fork Documentation and Final Verification

**Files:**

- Modify: `FORK_NOTES.md`

**Interfaces:**

- Consumes: The implemented platform delivery behavior.
- Produces: A durable fork-maintenance note for future upstream synchronization.

- [ ] **Step 1: Update the persistent fork note**

Replace the updater sentence with:

```md
Unsigned macOS and Windows fork builds open the matching Release for manual
installation; Linux packages and explicitly signed release builds retain
automatic updates.
```

Update the package section to state that unsigned Windows builds also use the exact Release page instead of attempting automatic installation.

- [ ] **Step 2: Run the complete relevant verification set**

Run:

```bash
pnpm exec vitest run \
  src/renderer/src/i18n/zh-menu-action-localization.test.ts \
  src/renderer/src/components/editor/RichMarkdownTableToolbar.test.tsx \
  src/renderer/src/components/settings/GeneralUpdateSettingsSection.test.tsx \
  src/main/updater-delivery-policy.test.ts \
  src/main/updater-prerelease-feed.test.ts \
  src/main/updater-events.test.ts \
  config/scripts/electron-builder-product-identity.test.mjs \
  config/scripts/fork-desktop-packages-workflow.test.mjs \
  config/scripts/fork-workflow-trigger-policy.test.mjs
pnpm run verify:localization-catalog
pnpm run typecheck
git diff --check
```

Expected: every command exits 0 with no failed tests or type errors.

- [ ] **Step 3: Confirm only intended files changed**

Run:

```bash
git status --short
git diff --stat HEAD~3
```

Expected: the user's `tests/test.md` remains untracked and untouched; product changes match Tasks 1–3 plus `FORK_NOTES.md`.

- [ ] **Step 4: Commit the fork note**

```bash
git add FORK_NOTES.md
git commit -m "docs(fork): record unsigned update delivery"
```

- [ ] **Step 5: Report completion without tagging or pushing**

Summarize the three implementation commits, verification evidence, and the exact platform behavior. Do not create a tag or push unless the user explicitly requests it.
