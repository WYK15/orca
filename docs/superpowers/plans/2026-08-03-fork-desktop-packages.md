# Fork Desktop Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, fork-safe GitHub Actions workflow that builds unsigned desktop installers for Windows, Linux x64/ARM64, and macOS x64/ARM64.

**Architecture:** One matrix job builds four runner combinations from a requested Git ref. Windows and Linux build their native architecture, while the existing macOS target set cross-packages x64 and arm64 on one Intel runner; every target uses `--publish never` and uploads only local artifacts.

**Tech Stack:** GitHub Actions, Node 24 from `package.json`, pnpm, Electron Builder 26, Vitest, YAML

## Global Constraints

- Work only in `/Users/wangyankun/Documents/ProjectTools/orca`.
- The workflow must never publish to `stablyai/orca`.
- Repository permissions remain `contents: read`.
- Do not use Apple, SignPath, PostHog, diagnostics, Slack, or upstream release secrets.
- Windows and macOS artifacts remain unsigned.
- The application update feed remains unchanged and continues following official Orca releases.
- Linux packaging must retain the Ubuntu 20.04 / glibc 2.31 compatibility gate.
- All scripts and workflow commands must remain compatible with macOS, Linux, and Windows.
- Never add a `max-lines` disable or per-file max-lines bump.

---

### Task 1: Define the fork workflow contract

**Files:**
- Create: `config/scripts/fork-desktop-packages-workflow.test.mjs`
- Test: `config/scripts/fork-desktop-packages-workflow.test.mjs`

**Interfaces:**
- Consumes: `.github/workflows/fork-desktop-packages.yml` as parsed YAML
- Produces: a contract for `workflow_dispatch`, the four matrix entries, local-only publishing, and artifact uploads

- [ ] **Step 1: Write the failing workflow test**

```js
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/fork-desktop-packages.yml'

describe('fork desktop package workflow', () => {
  it('builds every desktop platform architecture from a requested ref', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'))
    const entries = workflow.jobs.package.strategy.matrix.include

    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.workflow_dispatch.inputs.ref.required).toBe(false)
    expect(entries.map(({ platform }) => platform)).toEqual([
      'windows-x64',
      'linux-x64',
      'linux-arm64',
      'macos'
    ])
    expect(entries.map(({ os }) => os)).toEqual([
      'windows-2022',
      'ubuntu-24.04',
      'ubuntu-24.04-arm',
      'macos-15-intel'
    ])
  })

  it('packages locally and uploads every output', () => {
    const source = readFileSync(workflowPath, 'utf8')
    const workflow = parse(source)
    const entries = workflow.jobs.package.strategy.matrix.include
    const upload = workflow.jobs.package.steps.find(
      (step) => step.name === 'Upload desktop packages'
    )

    for (const entry of entries) {
      expect(entry.package_command).toContain('--publish never')
      expect(entry.artifact_paths).toBeTruthy()
    }
    expect(source).not.toContain('--publish always')
    expect(source).not.toContain('ORCA_BUILD_IDENTITY')
    expect(source).not.toContain('ORCA_POSTHOG_WRITE_KEY')
    expect(upload.uses).toBe('actions/upload-artifact@v7')
    expect(upload.with['if-no-files-found']).toBe('error')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-desktop-packages-workflow.test.mjs
```

Expected: FAIL because `.github/workflows/fork-desktop-packages.yml` does not exist.

### Task 2: Implement local-only cross-platform packaging

**Files:**
- Create: `.github/workflows/fork-desktop-packages.yml`
- Test: `config/scripts/fork-desktop-packages-workflow.test.mjs`

**Interfaces:**
- Consumes: optional `inputs.ref`, `package.json`, `pnpm-lock.yaml`, and `config/electron-builder.config.cjs`
- Produces: four workflow artifacts named `orca-<platform>-<run number>-<short SHA>`

- [ ] **Step 1: Add the workflow trigger, permissions, and matrix**

```yaml
name: Fork Desktop Packages

on:
  workflow_dispatch:
    inputs:
      ref:
        description: 'Branch, tag, or SHA to build'
        required: false
        default: ''
        type: string

permissions:
  contents: read

concurrency:
  group: fork-desktop-packages-${{ inputs.ref || github.ref_name }}
  cancel-in-progress: false

jobs:
  package:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-2022
            platform: windows-x64
            package_command: >-
              node config/scripts/ensure-native-runtime.mjs --runtime=electron;
              if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE };
              pnpm exec electron-builder --config config/electron-builder.config.cjs
              --win --x64 --publish never
            artifact_paths: dist/orca-windows-setup.exe
            electron_cache: |-
              ~\AppData\Local\electron\Cache
              ~\AppData\Local\electron-builder\Cache
          - os: ubuntu-24.04
            platform: linux-x64
            package_command: >-
              node config/scripts/ensure-native-runtime.mjs --runtime=electron &&
              pnpm exec electron-builder --config config/electron-builder.config.cjs
              --linux AppImage deb rpm --x64 --publish never
            artifact_paths: |-
              dist/*.AppImage
              dist/*.deb
              dist/*.rpm
            electron_cache: |-
              ~/.cache/electron
              ~/.cache/electron-builder
          - os: ubuntu-24.04-arm
            platform: linux-arm64
            package_command: >-
              node config/scripts/ensure-native-runtime.mjs --runtime=electron &&
              ORCA_LINUX_ARM64_RELEASE=1 pnpm exec electron-builder
              --config config/electron-builder.config.cjs
              --linux AppImage deb rpm --arm64 --publish never
            artifact_paths: |-
              dist/*.AppImage
              dist/*.deb
              dist/*.rpm
            electron_cache: |-
              ~/.cache/electron
              ~/.cache/electron-builder
          - os: macos-15-intel
            platform: macos
            package_command: >-
              node config/scripts/ensure-native-runtime.mjs --runtime=electron &&
              CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder
              --config config/electron-builder.config.cjs
              --mac --publish never
            artifact_paths: |-
              dist/orca-macos-*.dmg
              dist/*-mac.zip
            electron_cache: |-
              ~/Library/Caches/electron
              ~/Library/Caches/electron-builder
    runs-on: ${{ matrix.os }}
    timeout-minutes: 120
    env:
      NODE_OPTIONS: --max-old-space-size=4096
```

- [ ] **Step 2: Add checkout and toolchain setup**

```yaml
    steps:
      - name: Checkout requested ref
        uses: actions/checkout@v6
        with:
          ref: ${{ inputs.ref || github.ref }}
          fetch-depth: 0
          persist-credentials: false

      - name: Setup pnpm
        uses: pnpm/action-setup@v6
        with:
          run_install: false

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: package.json
          cache: pnpm

      - name: Use external node-gyp on Linux
        if: runner.os == 'Linux'
        shell: bash
        run: |
          npm install -g node-gyp@11.5.0
          echo "npm_config_node_gyp=$(npm root -g)/node-gyp/bin/node-gyp.js" >> "$GITHUB_ENV"

      - name: Cache Electron Builder downloads
        uses: actions/cache@v5
        with:
          path: ${{ matrix.electron_cache }}
          key: fork-electron-builder-${{ matrix.platform }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            fork-electron-builder-${{ matrix.platform }}-
```

- [ ] **Step 3: Add dependencies, build, package, and upload**

```yaml
      - name: Install dependencies
        uses: nick-fields/retry@v4
        with:
          timeout_minutes: 10
          max_attempts: 3
          retry_wait_seconds: 30
          command: pnpm install --frozen-lockfile

      - name: Install Linux package dependencies
        if: runner.os == 'Linux'
        shell: bash
        run: >-
          sudo apt-get update &&
          sudo apt-get install -y
          python3-gi gir1.2-atspi-2.0 at-spi2-core xclip xdotool rpm

      - name: Build package inputs
        run: pnpm run build:release

      - name: Package desktop app
        uses: nick-fields/retry@v4
        with:
          timeout_minutes: 30
          max_attempts: 2
          retry_wait_seconds: 30
          command: ${{ matrix.package_command }}

      - name: Upload desktop packages
        uses: actions/upload-artifact@v7
        with:
          name: orca-${{ matrix.platform }}-${{ github.run_number }}-${{ github.sha }}
          path: ${{ matrix.artifact_paths }}
          if-no-files-found: error
          retention-days: 14
```

- [ ] **Step 4: Run the workflow contract test**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-desktop-packages-workflow.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run workflow-focused static checks**

```bash
pnpm exec oxlint config/scripts/fork-desktop-packages-workflow.test.mjs
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit the workflow and contract test**

```bash
git add .github/workflows/fork-desktop-packages.yml config/scripts/fork-desktop-packages-workflow.test.mjs
git commit -m "ci: add fork desktop package builds"
```

### Task 3: Document the fork packaging boundary

**Files:**
- Modify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: the workflow behavior from Task 2
- Produces: operator-facing instructions and warnings for the persistent fork difference

- [ ] **Step 1: Extend `FORK_NOTES.md`**

```markdown
## Fork desktop packages

Run `Fork Desktop Packages` from the Actions tab and optionally enter a branch,
tag, or SHA. The workflow uploads Windows x64, Linux x64/ARM64, and macOS
x64/ARM64 installers to the workflow run for 14 days.

These personal Windows and macOS builds are unsigned, so SmartScreen or
Gatekeeper can warn when opening them. The workflow does not create a GitHub
Release and the application continues to use the official Orca update feed.
```

- [ ] **Step 2: Commit the documentation**

```bash
git add FORK_NOTES.md
git commit -m "docs: explain fork desktop packages"
```

### Task 4: Verify the packaging change

**Files:**
- Verify: `.github/workflows/fork-desktop-packages.yml`
- Verify: `config/scripts/fork-desktop-packages-workflow.test.mjs`
- Verify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: the completed workflow, contract test, and notes
- Produces: local evidence ready for GitHub execution

- [ ] **Step 1: Run the focused test and typecheck**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-desktop-packages-workflow.test.mjs
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Validate YAML syntax independently**

```bash
pnpm exec yaml-lint .github/workflows/fork-desktop-packages.yml
```

Expected: PASS. If the repository has no `yaml-lint` executable, rely on the parsed-YAML Vitest contract and record that the standalone command was unavailable.

- [ ] **Step 3: Review the complete fork delta**

```bash
git diff docs/fork-maintenance-guidance...HEAD --check
git status --short
git log --graph --oneline --decorate -20
```

Expected: no whitespace errors, clean status, and focused commits.

- [ ] **Step 4: Push branches after explicit execution approval**

```bash
git push -u origin backport/pr-12050-windows-path-ordering
git push -u origin backport/pr-12048-markdown-table-resize
git push -u origin backport/pr-11985-markdown-table-actions
git push -u origin custom/main
```

Expected: all four branches are available in `WYK15/orca`. Do not trigger the packaging workflow until the pushed `custom/main` contains the workflow file.
