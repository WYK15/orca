# Orcaw Independent Desktop Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the downstream desktop product as Orcaw so it can coexist with official Orca without sharing state, commands, helpers, installers, or update feeds.

**Architecture:** Store stable fork identity in `config/orcaw-product-identity.json`, project it into existing packaging and runtime seams, and keep platform behavior in the modules that already own it. Preserve internal `ORCA_*` contracts and `orca://` mobile pairing while changing every operating-system-visible desktop and CLI identity.

**Tech Stack:** Electron, electron-builder, TypeScript, Node.js ESM/CJS scripts, Swift helper app, PowerShell/C# launcher assets, Bash packaging hooks, GitHub Actions, Vitest.

## Global Constraints

- Product name is `Orcaw`; application ID is `com.wyk15.orcaw`.
- Development name is `Orcaw Dev`; development application IDs use `com.wyk15.orcaw.dev`.
- macOS app is `Orcaw.app`; Windows executable is `Orcaw.exe`; Linux executable and package are `orcaw-ide`.
- Native CLI command is `orcaw`; Linux and WSL command is `orcaw-ide`.
- GitHub update repository is `WYK15/orca`; no update failure may fall back to `stablyai/orca`.
- Unsigned macOS builds detect releases but require manual download; Windows and Linux retain automatic installation.
- Existing Orca profiles, commands, helpers, and installation files are never imported, rewritten, or deleted.
- Keep mobile branding and the `orca://` pairing format unchanged.
- Keep internal `ORCA_*` environment variables, IPC names, source modules, and intentional upstream attribution unchanged.
- Preserve macOS, Windows, Linux, WSL, SSH, relay, and folder-workspace behavior.
- Never add a `max-lines` disable or per-file line-limit bump.
- Use focused tests and affected type checks; do not run unrelated slow suites.

---

### Task 1: Canonical Product Identity and Desktop Packaging

**Files:**
- Create: `config/orcaw-product-identity.json`
- Modify: `package.json`
- Modify: `config/electron-builder.config.cjs`
- Modify: `config/scripts/electron-builder-config.test.mjs`
- Modify: `src/shared/local-build-compatibility-contract.json`
- Modify: `src/shared/local-build-compatibility-contract.ts`
- Test: `config/scripts/electron-builder-config.test.mjs`
- Test: `src/shared/local-build-compatibility.test.ts`

**Interfaces:**
- Produces: JSON fields `productName`, `appId`, `devAppName`, `devAppIdPrefix`, `computerUseAppName`, `computerUseBundleId`, `nativeCliCommand`, `linuxCliCommand`, `linuxPackageName`, `githubOwner`, `githubRepo`, and `artifactPrefix`.
- Consumes: Existing electron-builder environment switches such as `ORCA_MAC_RELEASE` and `ORCA_LINUX_ARM64_RELEASE`.
- Produces: Packaged metadata field `orcawMacAutoUpdate: boolean`, true only for the existing signed macOS release paths.

- [ ] **Step 1: Add failing packaging identity assertions**

Add assertions to `config/scripts/electron-builder-config.test.mjs`:

```js
const productIdentity = require('../orcaw-product-identity.json')

it('packages the independent Orcaw desktop identity', () => {
  expect(productIdentity).toMatchObject({
    productName: 'Orcaw',
    appId: 'com.wyk15.orcaw',
    nativeCliCommand: 'orcaw',
    linuxCliCommand: 'orcaw-ide',
    githubOwner: 'WYK15',
    githubRepo: 'orca'
  })
  expect(electronBuilderConfig).toMatchObject({
    appId: 'com.wyk15.orcaw',
    productName: 'Orcaw'
  })
  expect(electronBuilderConfig.win.executableName).toBe('Orcaw')
  expect(electronBuilderConfig.linux.executableName).toBe('orcaw-ide')
})

it('uses Orcaw artifact and Linux package names', () => {
  expect(electronBuilderConfig.nsis.artifactName).toBe('orcaw-windows-setup.${ext}')
  expect(electronBuilderConfig.dmg.artifactName).toBe('orcaw-macos-${arch}.${ext}')
  expect(electronBuilderConfig.appImage.artifactName).toBe('orcaw-linux.${ext}')
  expect(electronBuilderConfig.deb).toMatchObject({
    packageName: 'orcaw-ide',
    artifactName: 'orcaw-ide_${version}_${arch}.${ext}'
  })
  expect(electronBuilderConfig.rpm).toMatchObject({
    packageName: 'orcaw-ide',
    artifactName: 'orcaw-ide-${version}.${arch}.${ext}'
  })
})

it('publishes metadata for the fork repository', () => {
  expect(electronBuilderConfig.publish).toMatchObject({
    provider: 'github',
    owner: 'WYK15',
    repo: 'orca'
  })
})

expect(require('../../package.json').homepage).toBe('https://github.com/WYK15/orca')
```

Update the local-build compatibility tests to expect `com.wyk15.orcaw`.

- [ ] **Step 2: Run the packaging tests and verify the old identity fails**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  config/scripts/electron-builder-config.test.mjs \
  src/shared/local-build-compatibility.test.ts \
  --pool=threads --maxWorkers=1
```

Expected: FAIL because the builder and compatibility contract still report Orca and `com.stablyai.orca`.

- [ ] **Step 3: Add the canonical identity and project it into packaging**

Create `config/orcaw-product-identity.json`:

```json
{
  "productName": "Orcaw",
  "appId": "com.wyk15.orcaw",
  "devAppName": "Orcaw Dev",
  "devAppIdPrefix": "com.wyk15.orcaw.dev",
  "computerUseAppName": "Orcaw Computer Use",
  "computerUseBundleId": "com.wyk15.orcaw.computer-use",
  "nativeCliCommand": "orcaw",
  "linuxCliCommand": "orcaw-ide",
  "linuxPackageName": "orcaw-ide",
  "githubOwner": "WYK15",
  "githubRepo": "orca",
  "artifactPrefix": "orcaw"
}
```

In `config/electron-builder.config.cjs`, load the JSON with `require`, derive all
product, executable, package, artifact, and publish values from it, and add:

```js
extraMetadata: {
  ...(devChannelBuildVersion ? { version: devChannelBuildVersion } : {}),
  ...(localBuildVersion ? { version: localBuildVersion } : {}),
  orcawMacAutoUpdate: isMacRelease
}
```

Do not combine both version branches; preserve the current release-versus-local
precedence. Update the Linux `StartupWMClass` to `orcaw-ide`.

Keep the existing hourly/adhoc version switches for upstream reconciliation,
but route their generated publish metadata to `WYK15/orca` as well. This fork
must never emit a package configured to publish into a `stablyai` repository.

Change `package.json` to `"name": "orcaw"`, set its homepage to
`https://github.com/WYK15/orca`, and expose `"orcaw"` instead of the packaged
`"orca"` bin. Keep `orca-dev` unchanged because it is an internal checkout
command covered by the global constraints.

Update existing exact `extraMetadata` assertions to include
`orcawMacAutoUpdate: false` for unsigned/local builds and true only under the
signed `ORCA_MAC_RELEASE`, hourly, or adhoc paths.

Set both local-build compatibility authorities to `com.wyk15.orcaw`.

- [ ] **Step 4: Run focused packaging tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit the product identity seam**

```bash
git add config/orcaw-product-identity.json package.json \
  config/electron-builder.config.cjs \
  config/scripts/electron-builder-config.test.mjs \
  src/shared/local-build-compatibility-contract.json \
  src/shared/local-build-compatibility-contract.ts \
  src/shared/local-build-compatibility.test.ts
git commit -m "feat(branding): define independent Orcaw identity"
```

---

### Task 2: Runtime Name and User-Data Isolation

**Files:**
- Modify: `src/main/startup/dev-instance-identity.ts`
- Modify: `src/main/startup/dev-instance-identity.test.ts`
- Modify: `src/main/startup/configure-process.ts`
- Modify: `src/main/startup/configure-process.test.ts`
- Modify: `config/scripts/run-electron-vite-dev.mjs`
- Modify: `src/main/ipc/notifications.ts`
- Test: `src/main/startup/configure-process.test.ts`
- Test: `src/main/startup/dev-instance-identity.test.ts`
- Test: `src/main/ipc/notifications.test.ts`

**Interfaces:**
- Consumes: `productName`, `appId`, `devAppName`, and `devAppIdPrefix` from `config/orcaw-product-identity.json`.
- Produces: `getDevInstanceIdentity(false)` with stable Orcaw production identity and per-checkout Orcaw development identity.
- Preserves: E2E and `ORCA_DEV_USER_DATA_PATH` overrides.

- [ ] **Step 1: Change runtime identity tests to the Orcaw contract**

Update `src/main/startup/dev-instance-identity.test.ts`:

```ts
expect(getDevInstanceIdentity(false, {})).toMatchObject({
  name: 'Orcaw',
  appName: 'Orcaw',
  appUserModelId: 'com.wyk15.orcaw'
})

expect(getDevInstanceIdentity(true, { ORCA_DEV_BRANCH: 'feature/a' }).appName).toBe(
  'Orcaw Dev'
)
expect(identity.name).toBe('Orcaw: nwparker/dev-indicator')
expect(identity.appUserModelId).toMatch(/^com\.wyk15\.orcaw\.dev\.[a-f0-9]{10}$/)
```

Add a configure-process assertion that ordinary development uses
`join(appData, 'orcaw-dev')` and that explicit/E2E paths still win.

- [ ] **Step 2: Run identity tests and verify they fail**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/main/startup/dev-instance-identity.test.ts \
  src/main/startup/configure-process.test.ts \
  src/main/ipc/notifications.test.ts \
  --pool=threads --maxWorkers=1
```

Expected: FAIL on old production/dev names, IDs, and `orca-dev` profile path.

- [ ] **Step 3: Read runtime values from the canonical identity**

Import the JSON into `dev-instance-identity.ts` and replace the two identity
constants:

```ts
import productIdentity from '../../../config/orcaw-product-identity.json'

const BASE_APP_NAME = productIdentity.productName
const BASE_APP_USER_MODEL_ID = productIdentity.appId
```

Use `productIdentity.devAppName` for `appName` in dev mode and
`productIdentity.devAppIdPrefix` in `createDevAppUserModelId`.

In `configure-process.ts`, set the default dev profile to:

```ts
app.setPath('userData', join(app.getPath('appData'), 'orcaw-dev'))
```

Change the Electron Vite development wrapper bundle prefix and notification
bundle identity to `com.wyk15.orcaw.dev`. Update comments that describe timing
around `app.setName` without renaming internal APIs or environment variables.

- [ ] **Step 4: Run identity tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit runtime isolation**

```bash
git add src/main/startup/dev-instance-identity.ts \
  src/main/startup/dev-instance-identity.test.ts \
  src/main/startup/configure-process.ts \
  src/main/startup/configure-process.test.ts \
  config/scripts/run-electron-vite-dev.mjs \
  src/main/ipc/notifications.ts \
  src/main/ipc/notifications.test.ts
git commit -m "feat(branding): isolate Orcaw runtime data"
```

---

### Task 3: macOS Helper and Privacy Identities

**Files:**
- Modify: `config/scripts/build-computer-macos.mjs`
- Modify: `config/scripts/build-notification-status-macos.mjs`
- Modify: `config/electron-builder.config.cjs`
- Modify: `config/scripts/electron-builder-config.test.mjs`
- Modify: `native/computer-use-macos/Sources/OrcaComputerUseMacOS/main.swift`
- Modify: `native/computer-use-macos/Tests/OrcaComputerUseMacOSTests/AgentEntrypointSourceSafetyTests.swift`
- Modify: `src/main/computer/macos-native-provider-paths.ts`
- Create: `src/main/computer/macos-native-provider-paths.test.ts`
- Modify: `src/main/computer/macos-computer-use-permissions.ts`
- Modify: `src/main/computer/macos-computer-use-permissions.test.ts`
- Modify: `src/main/computer/macos-computer-use-permission-status.ts`
- Modify: `src/main/computer/macos-computer-use-permission-status.test.ts`
- Modify: `src/main/computer/computer-provider-unavailable-message.ts`
- Modify: `src/main/computer/computer-provider-unavailable-message.test.ts`
- Modify: `src/main/macos-tcc-prompt-watch.ts`
- Modify: `src/main/macos-tcc-prompt-watch.test.ts`

**Interfaces:**
- Consumes: `computerUseAppName`, `computerUseBundleId`, `appId`, and `devAppIdPrefix`.
- Produces: `Orcaw Computer Use.app` with bundle ID `com.wyk15.orcaw.computer-use`.
- Preserves: The internal helper executable `orca-computer-use-macos` and `ORCA_COMPUTER_MACOS_*` environment overrides.

- [ ] **Step 1: Add failing helper identity tests**

Change focused expectations to:

```ts
expect(resolveMacOSComputerUseAppPath()).toContain('Orcaw Computer Use.app')
expect(result.bundleId).toBe('com.wyk15.orcaw.computer-use')
```

Create a source-contract test for the default helper search:

```ts
const source = readFileSync(
  new URL('./macos-native-provider-paths.ts', import.meta.url),
  'utf8'
)
expect(source).toContain("'Orcaw Computer Use.app'")
expect(source).not.toContain("'Orca Computer Use.app'")
```

In `electron-builder-config.test.mjs`, require:

```js
expect(electronBuilderConfig.mac.extraResources).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      from: 'native/computer-use-macos/.build/release/Orcaw Computer Use.app',
      to: 'Orcaw Computer Use.app'
    })
  ])
)
```

Update the Swift source-safety fixture to require exact production and dev
owner IDs `com.wyk15.orcaw` and `com.wyk15.orcaw.dev.` and to reject
`com.stablyai.orca`.

- [ ] **Step 2: Run helper tests and verify they fail**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  config/scripts/electron-builder-config.test.mjs \
  src/main/computer/macos-native-provider-paths.test.ts \
  src/main/computer/macos-computer-use-permissions.test.ts \
  src/main/computer/macos-computer-use-permission-status.test.ts \
  src/main/computer/computer-provider-unavailable-message.test.ts \
  src/main/macos-tcc-prompt-watch.test.ts \
  --pool=threads --maxWorkers=1
```

On macOS also run:

```bash
swift test --package-path native/computer-use-macos \
  --filter AgentEntrypointSourceSafetyTests
```

Expected: FAIL on the old helper path, bundle IDs, and owner allowlist.

- [ ] **Step 3: Apply the Orcaw helper projection**

Load the canonical JSON in both Node build scripts. Build
`Orcaw Computer Use.app`, use `com.wyk15.orcaw.computer-use`, and update the
helper's permission copy to name Orcaw. Keep the internal Swift target and
binary name unchanged.

In `main.swift`, make `isTrustedOrcaApplication` accept exactly:

```swift
return bundleId == "com.wyk15.orcaw" ||
    bundleId.hasPrefix("com.wyk15.orcaw.dev.") ||
    bundleId == "com.github.Electron"
```

Update Electron Builder signing/resource paths, provider resolution, permission
errors, TCC responsible identifiers, and notification bundle constants to the
Orcaw identity. Do not leave an Orca helper fallback path because that would
adopt the official helper.

- [ ] **Step 4: Run helper tests**

Run the Step 2 commands.

Expected: PASS.

- [ ] **Step 5: Commit macOS helper isolation**

```bash
git add config/scripts/build-computer-macos.mjs \
  config/scripts/build-notification-status-macos.mjs \
  config/electron-builder.config.cjs \
  config/scripts/electron-builder-config.test.mjs \
  native/computer-use-macos/Sources/OrcaComputerUseMacOS/main.swift \
  native/computer-use-macos/Tests/OrcaComputerUseMacOSTests/AgentEntrypointSourceSafetyTests.swift \
  src/main/computer/macos-native-provider-paths.ts \
  src/main/computer/macos-native-provider-paths.test.ts \
  src/main/computer/macos-computer-use-permissions.ts \
  src/main/computer/macos-computer-use-permissions.test.ts \
  src/main/computer/macos-computer-use-permission-status.ts \
  src/main/computer/macos-computer-use-permission-status.test.ts \
  src/main/computer/computer-provider-unavailable-message.ts \
  src/main/computer/computer-provider-unavailable-message.test.ts \
  src/main/macos-tcc-prompt-watch.ts \
  src/main/macos-tcc-prompt-watch.test.ts
git commit -m "feat(macos): isolate Orcaw helper identities"
```

---

### Task 4: Native, Linux, WSL, SSH, and Relay CLI Coexistence

**Files:**
- Move/Modify: `resources/darwin/bin/orca` to `resources/darwin/bin/orcaw`
- Move/Modify: `resources/linux/bin/orca-ide` to `resources/linux/bin/orcaw-ide`
- Move/Modify: `resources/win32/bin/orca.cmd` to `resources/win32/bin/orcaw.cmd`
- Modify: `config/electron-builder.config.cjs`
- Modify: `resources/linux/packaging/after-install.sh`
- Modify: `resources/linux/packaging/after-remove.sh`
- Modify: `src/main/cli/cli-installer.ts`
- Modify: `src/main/cli/cli-installer.test.ts`
- Modify: `src/main/cli/wsl-cli-installer.ts`
- Modify: `src/main/cli/wsl-cli-installer.test.ts`
- Modify: `src/main/cli/linux-bare-orca-dispatcher.ts`
- Modify: `src/main/cli/linux-bare-orca-dispatcher.test.ts`
- Modify: `src/main/cli/linux-terminal-orca-cli-shim.ts`
- Modify: `src/main/cli/linux-terminal-orca-cli-shim.test.ts`
- Modify: `src/main/cli/packaged-cli-assets.test.ts`
- Modify: `src/main/cli/windows-launcher-asset.test.ts`
- Modify: `src/main/runtime/orchestration/cli-command.ts`
- Modify: `src/main/runtime/orchestration/cli-command.test.ts`
- Modify: `src/main/runtime/orchestration/coordinator.ts`
- Modify: `src/main/runtime/orchestration/coordinator.test.ts`
- Modify: `src/main/runtime/orchestration/preamble.ts`
- Modify: `src/main/runtime/orchestration/preamble.test.ts`
- Modify: `src/main/runtime/rpc/orchestration-legacy-operation.ts`
- Modify: `src/main/runtime/rpc/methods/orchestration.ts`
- Modify: `src/main/runtime/orca-runtime.ts`
- Modify: `src/main/runtime/orca-runtime.test.ts`
- Modify: `src/main/ipc/pty.ts`
- Modify: `src/main/ipc/pty.test.ts`
- Modify: `src/cli/help.ts`
- Modify: `src/cli/specs/environment.ts`
- Modify: `src/shared/pairing.test.ts`

**Interfaces:**
- Consumes: `nativeCliCommand` and `linuxCliCommand`.
- Produces: `OrchestrationCliCommand = 'orcaw' | 'orcaw-ide'`.
- Preserves: Internal `ORCA_USER_DATA_PATH`, remote runtime protocols, and bare `orca://` pairing values.

- [ ] **Step 1: Change CLI contract tests to the new public names**

Update the existing installer, WSL, orchestration, asset, and shim tests to
expect:

```ts
expect(installed.commandName).toBe(process.platform === 'linux' ? 'orcaw-ide' : 'orcaw')
expect(getTerminalOrchestrationCliCommand(args)).toBe('orcaw-ide')
expect(preamble).toContain('orcaw-ide orchestration send')
```

Add negative assertions that Orcaw installation does not create, move, delete,
or overwrite `orca` or `orca-ide`.

Keep a pairing regression assertion:

```ts
expect(encodePairingOffer(offer)).toMatch(/^orca:\/\/pair\?code=/)
```

For Linux packaging hooks, assert the managed link is `/usr/bin/orcaw-ide`, its
allowed targets are under `/opt/Orcaw` or `/opt/orcaw-ide`, and removal refuses
an `/opt/Orca/...` target.

- [ ] **Step 2: Run CLI tests and verify they fail**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/main/cli/cli-installer.test.ts \
  src/main/cli/wsl-cli-installer.test.ts \
  src/main/cli/linux-bare-orca-dispatcher.test.ts \
  src/main/cli/linux-terminal-orca-cli-shim.test.ts \
  src/main/cli/packaged-cli-assets.test.ts \
  src/main/cli/windows-launcher-asset.test.ts \
  src/main/runtime/orchestration/cli-command.test.ts \
  src/main/runtime/orchestration/coordinator.test.ts \
  src/main/runtime/orchestration/preamble.test.ts \
  src/shared/pairing.test.ts \
  --pool=threads --maxWorkers=1
```

Expected: FAIL because existing launchers and selectors still emit Orca names.

- [ ] **Step 3: Rename packaged assets and command selectors**

Move the three launcher assets to their Orcaw names and update their executable
paths/messages:

```bash
# macOS launcher target
ELECTRON="$CONTENTS/MacOS/Orcaw"

# Linux package link
link="/usr/bin/orcaw-ide"
```

Package the Windows native launcher as `bin/orcaw.exe`; its internal project
and executable source name may remain unchanged. Package `orcaw.cmd` beside it.

Replace public command unions and selector results with:

```ts
export type OrchestrationCliCommand = 'orcaw' | 'orcaw-ide'
```

Update native, WSL, Linux, SSH, and relay command construction consistently.
Remove the Orcaw code path that installs a bare `orca` Linux dispatcher; retain
the module only if another existing compatibility caller still needs it, and
make it a no-op for Orcaw with a focused test. Never clean up old Orca
launchers.

New command selectors return only `orcaw` or `orcaw-ide`. Persisted RPC and
database compatibility schemas may continue to parse legacy `orca`,
`orca-ide`, and `orca-dev` values so an older remote peer fails safely instead
of corrupting a record, but no new launcher, preamble, or command emission uses
those values.

Update CLI help examples to `orcaw` while leaving `orca://pair?...` untouched.

- [ ] **Step 4: Run CLI tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Run large runtime regressions by exact test name**

Add tests named `emits Orcaw CLI commands for packaged runtimes` in
`orca-runtime.test.ts` and `injects only the Orcaw Linux shim into managed
terminals` in `pty.test.ts`, then run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/main/runtime/orca-runtime.test.ts \
  -t "emits Orcaw CLI commands for packaged runtimes" \
  --pool=threads --maxWorkers=1
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/main/ipc/pty.test.ts \
  -t "injects only the Orcaw Linux shim into managed terminals" \
  --pool=threads --maxWorkers=1
```

Expected: PASS without running unrelated cases in either large file.

- [ ] **Step 6: Run focused node and CLI type checks**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm tsc --noEmit \
  -p config/tsconfig.node.json --pretty false
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm tsc --noEmit \
  -p config/tsconfig.tc.cli.json --pretty false
```

Expected: PASS with no stale `'orca' | 'orca-ide'` command unions.

- [ ] **Step 7: Commit CLI coexistence**

Stage only the files listed in this task, then:

```bash
git commit -m "feat(cli): install independent Orcaw commands"
```

---

### Task 5: Fork-Only Updates and Unsigned macOS Manual Delivery

**Files:**
- Create: `src/main/updater-delivery-policy.ts`
- Create: `src/main/updater-delivery-policy.test.ts`
- Modify: `src/main/updater-prerelease-feed.ts`
- Modify: `src/main/updater-prerelease-feed.test.ts`
- Modify: `src/main/updater-prerelease-feed-readiness.test.ts`
- Modify: `src/main/updater.ts`
- Modify: `src/main/updater.test.ts`
- Modify: `src/main/updater-events.ts`
- Modify: `src/main/updater-events.test.ts`
- Modify: `src/shared/release-channel.ts`
- Modify: `src/shared/release-channel.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/components/UpdateCard.tsx`
- Modify: `src/renderer/src/components/UpdateCard.test.ts`
- Modify: `src/renderer/src/components/UpdateCard.error-card.test.tsx`

**Interfaces:**
- Produces: `ReleaseUpdateDelivery = 'automatic' | 'manual'`.
- Produces: `getReleaseUpdateDelivery(platform: NodeJS.Platform, macAutoUpdateEnabled: boolean): ReleaseUpdateDelivery`.
- Produces: `readPackagedMacAutoUpdateEnabled(appPath: string): boolean`.
- Extends: `UpdateStatus` available state with optional `delivery: ReleaseUpdateDelivery`; absence preserves the existing automatic path for compatibility.
- Consumes: Packaged `orcawMacAutoUpdate` metadata from Task 1.

- [ ] **Step 1: Add failing fork-feed and delivery-policy tests**

Create `src/main/updater-delivery-policy.test.ts`:

```ts
expect(getReleaseUpdateDelivery('win32', false)).toBe('automatic')
expect(getReleaseUpdateDelivery('linux', false)).toBe('automatic')
expect(getReleaseUpdateDelivery('darwin', false)).toBe('manual')
expect(getReleaseUpdateDelivery('darwin', true)).toBe('automatic')
```

Use temporary `package.json` fixtures to require literal boolean
`orcawMacAutoUpdate`; missing, malformed, or non-boolean values return false.

Change updater feed tests to expect:

```ts
'https://github.com/WYK15/orca/releases.atom'
'https://github.com/WYK15/orca/releases/download'
'https://github.com/WYK15/orca/releases/latest/download'
```

Add a source scan assertion that production updater modules contain no
`stablyai/orca` fallback.

Update renderer tests so a manual available status renders a Release download
button and never calls `window.api.updater.download`.

- [ ] **Step 2: Run updater tests and verify they fail**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/main/updater-delivery-policy.test.ts \
  src/main/updater-prerelease-feed.test.ts \
  src/main/updater-prerelease-feed-readiness.test.ts \
  src/main/updater.test.ts \
  src/main/updater-events.test.ts \
  src/shared/release-channel.test.ts \
  src/renderer/src/components/UpdateCard.test.ts \
  src/renderer/src/components/UpdateCard.error-card.test.tsx \
  --pool=threads --maxWorkers=1
```

Expected: FAIL on the missing policy, official feed URLs, and absent manual
delivery state.

- [ ] **Step 3: Implement the fail-closed delivery policy**

In `updater-delivery-policy.ts`:

```ts
export type ReleaseUpdateDelivery = 'automatic' | 'manual'

export function getReleaseUpdateDelivery(
  platform: NodeJS.Platform,
  macAutoUpdateEnabled: boolean
): ReleaseUpdateDelivery {
  return platform === 'darwin' && !macAutoUpdateEnabled ? 'manual' : 'automatic'
}
```

Implement `readPackagedMacAutoUpdateEnabled(appPath)` with `readFileSync`,
`path.join`, and strict JSON parsing. Return false on any error.

Derive every main, prerelease, manifest, asset, and release-notes URL from
`WYK15/orca`. Do not retain a catch-path URL to the official repository.

When `update-available` fires, set `delivery` from the packaged metadata. For
manual delivery, retain the version and fork Release URL but do not call
`downloadUpdate`. In `UpdateCard`, use the existing shadcn buttons and design
tokens to show `Download Orcaw <version>` linking to the fork Release; automatic
states preserve the current update button and download flow.

- [ ] **Step 4: Run updater tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Run affected web and node type checks**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm tsc --noEmit \
  -p config/tsconfig.node.json --pretty false
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm tsc --noEmit \
  -p config/tsconfig.tc.web.json --pretty false
```

Expected: PASS, including exhaustive handling of `delivery`.

- [ ] **Step 6: Commit fork updater behavior**

```bash
git add src/main/updater-delivery-policy.ts \
  src/main/updater-delivery-policy.test.ts \
  src/main/updater-prerelease-feed.ts \
  src/main/updater-prerelease-feed.test.ts \
  src/main/updater-prerelease-feed-readiness.test.ts \
  src/main/updater.ts src/main/updater.test.ts \
  src/main/updater-events.ts src/main/updater-events.test.ts \
  src/shared/release-channel.ts src/shared/release-channel.test.ts \
  src/shared/types.ts \
  src/renderer/src/components/UpdateCard.tsx \
  src/renderer/src/components/UpdateCard.test.ts \
  src/renderer/src/components/UpdateCard.error-card.test.tsx
git commit -m "feat(updater): use Orcaw fork releases"
```

---

### Task 6: Orcaw Release Assets and Publication Gate

**Files:**
- Modify: `.github/workflows/fork-desktop-packages.yml`
- Modify: `config/scripts/fork-desktop-packages-workflow.test.mjs`
- Modify: `config/scripts/verify-release-required-assets.mjs`
- Modify: `config/scripts/verify-release-required-assets.test.mjs`

**Interfaces:**
- Consumes: Artifact names emitted by Task 1.
- Produces: Temporary Actions artifacts named `orcaw-<platform>-<run>-<sha>`.
- Produces: Required Release asset contract for Orcaw installers and updater metadata.

- [ ] **Step 1: Change workflow contract tests to Orcaw assets**

Require:

```js
const verify = release.steps.find((step) => step.name === 'Verify Orcaw release assets')

expect(windows.artifact_paths).toBe('dist/orcaw-windows-setup.exe')
expect(macos.artifact_paths).toContain('dist/orcaw-macos-*.dmg')
expect(upload.with.name).toBe(
  'orcaw-${{ matrix.platform }}-${{ github.run_number }}-${{ steps.source.outputs.short_sha }}'
)
expect(download.with.pattern).toBe('orcaw-*-${{ github.run_number }}-*')
expect(verify.run).toContain(
  'node config/scripts/verify-release-required-assets.mjs "$TAG_NAME"'
)
```

Change required release assets to:

```js
[
  'orcaw-linux.AppImage',
  'orcaw-linux-arm64.AppImage',
  `orcaw-ide_${version}_amd64.deb`,
  `orcaw-ide_${version}_arm64.deb`,
  `orcaw-ide-${version}.x86_64.rpm`,
  `orcaw-ide-${version}.aarch64.rpm`,
  'orcaw-windows-setup.exe',
  'orcaw-windows-setup.exe.blockmap',
  `Orcaw-${version}-mac.zip`,
  `Orcaw-${version}-arm64-mac.zip`,
  'orcaw-macos-x64.dmg',
  'orcaw-macos-arm64.dmg'
]
```

Keep the matching blockmaps and all four `latest*.yml` manifests required.

- [ ] **Step 2: Run workflow and release-contract tests and verify they fail**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  config/scripts/fork-desktop-packages-workflow.test.mjs \
  config/scripts/verify-release-required-assets.test.mjs \
  --pool=threads --maxWorkers=1
```

Expected: FAIL on old `orca-*` artifact paths and required names.

- [ ] **Step 3: Update the fork workflow and publication gate**

Change matrix paths, Actions artifact names, and download patterns to Orcaw.
Keep the tag trigger, draft-first publication, all-platform dependency,
least-privilege permissions, unsigned macOS environment, retries, and
`--publish never` packaging behavior unchanged.

Update `getRequiredReleaseAssetNames` and manifest validation to require Orcaw
names. The default repository for a local invocation becomes `WYK15/orca`, while
GitHub Actions continues to use `GITHUB_REPOSITORY`.

After uploading assets and before `Publish release`, add a
`Verify Orcaw release assets` step with `GH_TOKEN`, `TAG_NAME`, and:

```bash
node config/scripts/verify-release-required-assets.mjs "$TAG_NAME"
```

The publication step runs only after this verification exits successfully.

- [ ] **Step 4: Run workflow and release tests**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit release identity**

```bash
git add .github/workflows/fork-desktop-packages.yml \
  config/scripts/fork-desktop-packages-workflow.test.mjs \
  config/scripts/verify-release-required-assets.mjs \
  config/scripts/verify-release-required-assets.test.mjs
git commit -m "ci(release): publish Orcaw desktop assets"
```

---

### Task 7: Fork Notes and Final Focused Verification

**Files:**
- Modify: `FORK_NOTES.md`
- Modify: Any focused test fixture proven stale by Tasks 1–6, limited to public product identity and command contracts.

**Interfaces:**
- Consumes: Final product identity, CLI names, update policy, and artifact names.
- Produces: Persistent downstream maintenance guidance.

- [ ] **Step 1: Update fork documentation**

Add a persistent customization entry stating:

```markdown
- Desktop builds ship as Orcaw with the independent `com.wyk15.orcaw`
  application identity, isolated user data, `orcaw` / `orcaw-ide` commands,
  and updates sourced only from `WYK15/orca`. Preserve these seams during
  upstream synchronization.
```

Update package examples to Orcaw asset names and document that unsigned macOS
builds open the Release page for manual replacement.

- [ ] **Step 2: Run the complete focused identity suite**

Run the union of the test files from Tasks 1–6 with one worker:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  config/scripts/electron-builder-config.test.mjs \
  config/scripts/fork-desktop-packages-workflow.test.mjs \
  config/scripts/verify-release-required-assets.test.mjs \
  src/main/startup/dev-instance-identity.test.ts \
  src/main/startup/configure-process.test.ts \
  src/main/ipc/notifications.test.ts \
  src/main/computer/macos-native-provider-paths.test.ts \
  src/main/computer/macos-computer-use-permissions.test.ts \
  src/main/computer/macos-computer-use-permission-status.test.ts \
  src/main/computer/computer-provider-unavailable-message.test.ts \
  src/main/macos-tcc-prompt-watch.test.ts \
  src/main/cli/cli-installer.test.ts \
  src/main/cli/wsl-cli-installer.test.ts \
  src/main/cli/linux-bare-orca-dispatcher.test.ts \
  src/main/cli/linux-terminal-orca-cli-shim.test.ts \
  src/main/cli/packaged-cli-assets.test.ts \
  src/main/cli/windows-launcher-asset.test.ts \
  src/main/runtime/orchestration/cli-command.test.ts \
  src/main/runtime/orchestration/coordinator.test.ts \
  src/main/runtime/orchestration/preamble.test.ts \
  src/shared/pairing.test.ts \
  src/main/updater-delivery-policy.test.ts \
  src/main/updater-prerelease-feed.test.ts \
  src/main/updater-prerelease-feed-readiness.test.ts \
  src/main/updater.test.ts \
  src/main/updater-events.test.ts \
  src/shared/local-build-compatibility.test.ts \
  src/shared/release-channel.test.ts \
  src/renderer/src/components/UpdateCard.test.ts \
  src/renderer/src/components/UpdateCard.error-card.test.tsx \
  --pool=threads --maxWorkers=1
```

Expected: every listed file passes.

- [ ] **Step 3: Re-run focused native and large-file regressions**

```bash
swift test --package-path native/computer-use-macos \
  --filter AgentEntrypointSourceSafetyTests
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/main/runtime/orca-runtime.test.ts \
  -t "emits Orcaw CLI commands for packaged runtimes" \
  --pool=threads --maxWorkers=1
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/main/ipc/pty.test.ts \
  -t "injects only the Orcaw Linux shim into managed terminals" \
  --pool=threads --maxWorkers=1
```

Expected: all three focused regressions pass.

- [ ] **Step 4: Run affected type and quality checks**

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm typecheck
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm check:code-quality:changed 9980737b3
git diff --check
```

Expected: all commands exit 0 and the changed-code gate reports no new findings.

- [ ] **Step 5: Verify stale public identities are intentional**

Run:

```bash
rg -n "com\\.stablyai\\.orca|stablyai/orca|\\borca-ide\\b|Orca\\.app|Orca\\.exe" \
  config/electron-builder.config.cjs \
  config/scripts/build-computer-macos.mjs \
  config/scripts/build-notification-status-macos.mjs \
  .github/workflows/fork-desktop-packages.yml \
  src/main/startup \
  src/main/computer \
  src/main/cli \
  src/main/updater.ts \
  src/main/updater-prerelease-feed.ts \
  src/shared/release-channel.ts \
  resources/darwin/bin \
  resources/linux \
  resources/win32/bin
```

Expected: no production identity, update URL, install path, or managed command
uses the official values. Remaining matches must be tests asserting that Orcaw
does not touch Orca, historical comments/links, or internal source terminology.

- [ ] **Step 6: Commit documentation and any proven fixture updates**

```bash
git add FORK_NOTES.md
git commit -m "docs: record independent Orcaw desktop identity"
```

- [ ] **Step 7: Inspect final repository state**

```bash
git status --short
git log --oneline --decorate -10
```

Expected: only the user's pre-existing untracked `.superpowers/` and
`tests/test.md` remain; do not add or modify them.
