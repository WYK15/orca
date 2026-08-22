# Upstream Sync Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the two-branch upstream-tracking model, a validated customization registry, stable-release/version checks, and a safe manual workflow without yet replaying the current customization history onto a new upstream base.

**Architecture:** `upstream-sync` mirrors the latest selected stable upstream release while `main` remains the releasable Orcaw branch. Structured entries in `FORK_NOTES.md` and stable `Fork-Customization` trailers define the replay layer; Node-based validators and a manually dispatched GitHub workflow enforce the contract. The first full replay onto upstream `v1.4.187` is a separate follow-up plan because it requires domain-specific equivalence decisions and conflict resolutions.

**Tech Stack:** Git 2.25-compatible commands, Node.js 22 ESM, Vitest, GitHub Actions YAML, pnpm

**Spec:** `docs/superpowers/specs/2026-08-22-upstream-sync-customization-replay-design.md`

## Global Constraints

- Only formal stable upstream versions are eligible; release candidates must be rejected.
- `upstream-sync` must match the selected upstream release tree and contain no Orcaw commits.
- `main` may be rewritten only during an approved adoption and only with `--force-with-lease`; this foundation plan uses a fast-forward promotion and does not rewrite it.
- No persistent customization may be retired automatically; `upstream-candidate` remains replay-required until explicit confirmation.
- Every downstream behavior that must survive a future adoption needs a stable `ORCAW-NNN` record.
- Existing release tags remain immutable.
- Preserve the `v<upstream>-wyk.<revision>` version format and reset the revision to `1` only after adopting a new upstream base.
- Do not add scheduled workflow triggers; the fork intentionally disables inherited cron schedules.
- Keep Git commands compatible with Git 2.25 and preserve cross-platform Node behavior.
- Never use raw `git push --force`.

## File Map

- Create `config/scripts/fork-customization-registry.mjs`: parse and validate the structured customization table in `FORK_NOTES.md`.
- Create `config/scripts/fork-customization-registry.test.mjs`: parser and static-registry contract tests.
- Create `config/scripts/fork-customization-commit-coverage.mjs`: compare registry states with commit trailers in a replay range.
- Create `config/scripts/fork-customization-commit-coverage.test.mjs`: pure and temporary-Git-repository coverage tests.
- Create `config/scripts/fork-release-contract.mjs`: stable upstream tag and downstream version validation.
- Create `config/scripts/fork-release-contract.test.mjs`: stable/prerelease/version contract tests.
- Create `.github/workflows/fork-upstream-sync.yml`: manually advance `upstream-sync` to an explicitly selected stable tag.
- Create `config/scripts/fork-upstream-sync-workflow.test.mjs`: static workflow safety tests.
- Create `docs/reference/fork-upstream-sync.md`: operational reference and recovery procedure.
- Modify `FORK_NOTES.md`: convert persistent differences into stable active/candidate records while retaining backport history.
- Modify `AGENTS.md:62-71`: encode the approved branch, trailer, and retirement rules.
- Modify `package.json:29-36`: expose the static registry verifier.

---

### Task 1: Add the structured customization registry

**Files:**

- Create: `config/scripts/fork-customization-registry.mjs`
- Create: `config/scripts/fork-customization-registry.test.mjs`
- Modify: `FORK_NOTES.md`

**Interfaces:**

- Produces: `parseForkCustomizationRegistry(markdown: string): CustomizationEntry[]`
- Produces: `validateForkCustomizationRegistry(entries: CustomizationEntry[]): string[]`
- Produces entry shape: `{ id, title, status, introduced, contract, scope, verification, upstream }`
- Consumes: the `## Customization Registry` Markdown table in `FORK_NOTES.md`

- [ ] **Step 1: Write parser contract tests**

Create `config/scripts/fork-customization-registry.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import {
  parseForkCustomizationRegistry,
  validateForkCustomizationRegistry
} from './fork-customization-registry.mjs'

const HEADER = `| ID | Title | Status | Introduced | Contract | Scope | Verification | Upstream |
| --- | --- | --- | --- | --- | --- | --- | --- |`

function registry(...rows) {
  return `# Fork Notes\n\n## Customization Registry\n\n${HEADER}\n${rows.join('\n')}\n`
}

describe('fork customization registry', () => {
  it('parses an active customization', () => {
    const entries = parseForkCustomizationRegistry(
      registry(
        '| ORCAW-001 | Independent identity | active | 1.4.165-wyk.4 | Keep isolated identity | `config/orcaw-product-identity.json` | `config/scripts/electron-builder-product-identity.test.mjs` | none |'
      )
    )

    expect(entries).toEqual([
      {
        id: 'ORCAW-001',
        title: 'Independent identity',
        status: 'active',
        introduced: '1.4.165-wyk.4',
        contract: 'Keep isolated identity',
        scope: '`config/orcaw-product-identity.json`',
        verification: '`config/scripts/electron-builder-product-identity.test.mjs`',
        upstream: 'none'
      }
    ])
  })

  it.each(['active', 'upstream-candidate', 'retired'])('accepts status %s', (status) => {
    const entries = parseForkCustomizationRegistry(
      registry(`| ORCAW-001 | Identity | ${status} | 1.4.165-wyk.4 | Contract | scope | test | none |`)
    )

    expect(validateForkCustomizationRegistry(entries)).toEqual([])
  })

  it('rejects duplicate IDs, missing fields, malformed IDs, and unknown statuses', () => {
    const entries = parseForkCustomizationRegistry(
      registry(
        '| ORCAW-001 | Identity | active | 1.4.165-wyk.4 | Contract | scope | test | none |',
        '| ORCAW-001 | Duplicate | unknown | | Contract | scope | test | none |',
        '| FORK-2 | Invalid | active | 1.4.165-wyk.4 | Contract | scope | test | none |'
      )
    )

    expect(validateForkCustomizationRegistry(entries)).toEqual(
      expect.arrayContaining([
        'Duplicate customization ID: ORCAW-001',
        'ORCAW-001 has invalid status: unknown',
        'ORCAW-001 is missing introduced',
        'Invalid customization ID: FORK-2'
      ])
    )
  })

  it('fails when the registry section is absent', () => {
    expect(() => parseForkCustomizationRegistry('# Fork Notes\n')).toThrow(
      'Missing ## Customization Registry table'
    )
  })
})
```

- [ ] **Step 2: Run the parser tests and verify failure**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-customization-registry.test.mjs
```

Expected: FAIL because `fork-customization-registry.mjs` does not exist.

- [ ] **Step 3: Implement the registry parser and CLI**

Create `config/scripts/fork-customization-registry.mjs` with:

```js
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const STATUSES = new Set(['active', 'upstream-candidate', 'retired'])
const ID_PATTERN = /^ORCAW-\d{3}$/
const FIELDS = ['id', 'title', 'status', 'introduced', 'contract', 'scope', 'verification', 'upstream']

export function parseForkCustomizationRegistry(markdown) {
  const section = markdown.split(/^## Customization Registry\s*$/m)[1]?.split(/^## /m)[0]
  if (!section) throw new Error('Missing ## Customization Registry table')

  const rows = section
    .split('\n')
    .filter((line) => /^\|\s*ORCAW-|^\|\s*FORK-/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))

  return rows.map((cells) => Object.fromEntries(FIELDS.map((field, index) => [field, cells[index] ?? ''])))
}

export function validateForkCustomizationRegistry(entries) {
  const errors = []
  const seen = new Set()
  for (const entry of entries) {
    if (!ID_PATTERN.test(entry.id)) errors.push(`Invalid customization ID: ${entry.id}`)
    if (seen.has(entry.id)) errors.push(`Duplicate customization ID: ${entry.id}`)
    seen.add(entry.id)
    if (!STATUSES.has(entry.status)) errors.push(`${entry.id} has invalid status: ${entry.status}`)
    for (const field of FIELDS.slice(1)) {
      if (!entry[field]) errors.push(`${entry.id} is missing ${field}`)
    }
  }
  return errors
}

function run(path) {
  const entries = parseForkCustomizationRegistry(readFileSync(path, 'utf8'))
  const errors = validateForkCustomizationRegistry(entries)
  if (errors.length) throw new Error(errors.join('\n'))
  process.stdout.write(`Validated ${entries.length} fork customizations\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run(process.argv[2] ?? 'FORK_NOTES.md')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
```

Keep the final implementation focused; add trimming or precise malformed-row errors only when required by the tests.

- [ ] **Step 4: Convert `FORK_NOTES.md` to the initial registry**

Keep the existing backport and desktop-package sections. Replace `## Persistent customizations` with `## Customization Registry` and these records:

| ID | Title | Status | Introduced | Contract | Scope | Verification | Upstream |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ORCAW-001 | Independent desktop identity and update channel | active | 1.4.165-wyk.4 | Preserve Orcaw identity, isolated user data, CLI/helper names, and fork-scoped updates | `config/orcaw-product-identity.json`, `config/electron-builder.config.cjs`, `src/main/updater-delivery-policy.ts`, `src/shared/orca-cli-command-name.ts` | `config/scripts/electron-builder-product-identity.test.mjs`, `src/main/updater.test.ts`, `src/main/cli/cli-installer.test.ts` | none |
| ORCAW-002 | Fork-owned desktop release delivery | active | 1.4.165-wyk.4 | Preserve fork package assets, release publication, signing policy, and disabled inherited schedules | `.github/workflows/fork-desktop-packages.yml`, `config/scripts/release-publication-kind.mjs` | `config/scripts/fork-desktop-packages-workflow.test.mjs`, `config/scripts/fork-workflow-trigger-policy.test.mjs`, `config/scripts/release-publication-kind.test.mjs` | none |
| ORCAW-003 | Workspace-tab compression floor | active | 1.4.165-wyk.4 | Keep workspace tabs at a 72px minimum before overflow | `src/renderer/src/components/tab-bar/tab-width-rules.ts` | `src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx` | none |
| ORCAW-004 | Rich-Markdown table insertion controls | active | 1.4.165-wyk.4 | Preserve the 10×10 grid, validated custom size, and header/body insertion semantics | `src/renderer/src/components/editor/RichMarkdownTableInsertMenu.tsx`, `src/renderer/src/components/editor/rich-markdown-table-insertion.ts` | `src/renderer/src/components/editor/RichMarkdownTableInsertMenu.test.tsx`, `src/renderer/src/components/editor/rich-markdown-table-insertion.test.ts` | none |
| ORCAW-005 | Bounded safe rich-Markdown HTML | active | 1.4.165-wyk.4 | Render and source-edit the safe allowlist while preserving unsupported HTML losslessly | `src/renderer/src/components/editor/rich-markdown-safe-html-source.ts`, `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.ts` | `src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts`, `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.test.ts` | none |
| ORCAW-006 | Browser title stability | upstream-candidate | 1.4.165-wyk.5 | Ignore stale title events and preserve the active worktree page title | `src/renderer/src/components/browser-pane/browser-page-title-event.ts`, `src/renderer/src/components/browser-pane/BrowserPane.tsx` | `src/renderer/src/components/browser-pane/browser-page-title-event.test.ts` | pending upstream review |
| ORCAW-007 | Chinese editor localization | upstream-candidate | 1.4.165-wyk.5 | Preserve Chinese rich-Markdown editor and menu labels | `src/renderer/src/i18n/locales/zh.json` | `src/renderer/src/i18n/zh-menu-action-localization.test.ts` | pending upstream review |
| ORCAW-008 | Agent-hook configuration safety | upstream-candidate | 1.4.165-wyk.6 | Fail closed without detected agents and preserve safe local, WSL, and remote hook updates | `src/main/agent-hooks/managed-hook-runtime.ts`, `src/main/agent-hooks/remote-managed-hook-installers.ts` | `src/main/agent-hooks/managed-hook-runtime.test.ts`, `src/main/agent-hooks/remote-hook-service-installers.test.ts`, `src/main/agent-hooks/wsl-hook-relay-manager.test.ts` | pending upstream review |
| ORCAW-009 | Complete Codex and bulk AI Vault deletion | upstream-candidate | 1.4.165-wyk.6 | Delete complete supported Codex sessions and preserve multi-session deletion | `src/main/ai-vault/codex-session-delete.ts`, `src/main/ipc/ai-vault-delete.ts`, `src/renderer/src/components/right-sidebar/ai-vault-session-delete-action.ts` | `src/main/ai-vault/codex-session-delete.test.ts`, `src/main/ipc/ai-vault.test.ts`, `src/renderer/src/components/right-sidebar/ai-vault-session-delete-action.test.tsx` | pending upstream review |
| ORCAW-010 | WSL failed-scan terminal preservation | upstream-candidate | 1.4.165-wyk.8 | Preserve existing terminals when WSL worktree scanning fails | `src/main/git/worktree.ts` | `src/main/git/worktree.test.ts`, `src/main/ipc/worktrees.test.ts` | pending upstream review |
| ORCAW-011 | Linux relay process-scan bound | upstream-candidate | 1.4.165-wyk.8 | Avoid procfs-wide `pgrep` scans during Linux relay handling | `src/relay/pty-shell-utils.ts` | `src/relay/pty-shell-utils.test.ts` | pending upstream review |
| ORCAW-012 | Remote transcript parse cache | upstream-candidate | 1.4.165-wyk.8 | Reuse unchanged remote AI Vault transcript parses | `src/main/ai-vault/remote-session-parse-cache.ts`, `src/main/ai-vault/remote-session-scanner.ts` | `src/main/ai-vault/remote-session-scanner.test.ts` | pending upstream review |
| ORCAW-013 | Windows editor tab identity | upstream-candidate | 1.4.165-wyk.10 | Preserve active-file tabs across Windows path identity variants | `src/renderer/src/store/slices/editor-tab-file-identity.ts`, `src/renderer/src/store/slices/tabs.ts` | `src/renderer/src/store/slices/tabs.test.ts` | pending upstream review |
| ORCAW-014 | Markdown editing and source outline | upstream-candidate | 1.4.165-wyk.11 | Preserve source editing, Markdown table of contents, and inline editing behavior | `src/renderer/src/components/editor/MarkdownSourceEditorSurface.tsx`, `src/renderer/src/components/editor/markdown-table-of-contents.ts`, `src/renderer/src/components/editor/rich-markdown-inline-input.ts` | `src/renderer/src/components/editor/EditorContent.monaco-lifecycle.test.tsx`, `src/renderer/src/components/editor/MarkdownTableOfContentsPanel.test.tsx`, `src/renderer/src/components/editor/rich-markdown-inline-input.test.ts` | pending upstream review |

Do not mark any candidate retired in this task.

- [ ] **Step 5: Run registry verification**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-customization-registry.test.mjs
node config/scripts/fork-customization-registry.mjs FORK_NOTES.md
```

Expected: tests PASS and CLI prints `Validated 14 fork customizations`.

- [ ] **Step 6: Commit the registry**

```bash
git add FORK_NOTES.md config/scripts/fork-customization-registry.mjs config/scripts/fork-customization-registry.test.mjs
git commit -m "docs: register replayable fork customizations"
```

---

### Task 2: Validate customization commit coverage

**Files:**

- Create: `config/scripts/fork-customization-commit-coverage.mjs`
- Create: `config/scripts/fork-customization-commit-coverage.test.mjs`

**Interfaces:**

- Consumes: `CustomizationEntry[]` from `parseForkCustomizationRegistry`
- Produces: `readCustomizationCommits({ cwd, baseRef, headRef }): CommitCustomization[]`
- Produces: `validateCustomizationCoverage(entries, commits): string[]`
- Commit shape: `{ sha, subject, customizationIds, backports }`

- [ ] **Step 1: Write failing coverage tests**

Create tests that exercise the pure validator and one real temporary Git repository:

```js
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readCustomizationCommits,
  validateCustomizationCoverage
} from './fork-customization-commit-coverage.mjs'

const tempDirs = []
const entries = [
  { id: 'ORCAW-001', status: 'active' },
  { id: 'ORCAW-002', status: 'upstream-candidate' },
  { id: 'ORCAW-003', status: 'retired' }
]

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe('fork customization commit coverage', () => {
  it('requires active and candidate IDs exactly once and retired IDs zero times', () => {
    const commits = [
      { sha: 'a', subject: 'identity', customizationIds: ['ORCAW-001'], backports: [] },
      { sha: 'b', subject: 'candidate', customizationIds: ['ORCAW-002'], backports: [] }
    ]

    expect(validateCustomizationCoverage(entries, commits)).toEqual([])
  })

  it('reports missing, duplicate, retired, and unregistered IDs', () => {
    const commits = [
      { sha: 'a', subject: 'first', customizationIds: ['ORCAW-001'], backports: [] },
      { sha: 'b', subject: 'duplicate', customizationIds: ['ORCAW-001'], backports: [] },
      { sha: 'c', subject: 'retired', customizationIds: ['ORCAW-003'], backports: [] },
      { sha: 'd', subject: 'unknown', customizationIds: ['ORCAW-999'], backports: [] }
    ]

    expect(validateCustomizationCoverage(entries, commits)).toEqual(
      expect.arrayContaining([
        'ORCAW-001 appears in 2 commits; expected exactly 1',
        'ORCAW-002 appears in 0 commits; expected exactly 1',
        'Retired customization ORCAW-003 still appears in 1 commit',
        'Unregistered customization trailer: ORCAW-999'
      ])
    )
  })
})
```

Add a fixture test that initializes Git, creates a base commit, then commits with this body:

```text
feat: preserve identity

Fork-Customization: ORCAW-001
Upstream-Backport: stablyai/orca#12050
```

Assert that `readCustomizationCommits()` returns both trailers without parsing the subject text.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-customization-commit-coverage.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement Git trailer extraction and coverage validation**

Use Git 2.25-compatible plumbing without relying on newer trailer-format options:

```js
execFileSync(
  'git',
  ['log', '--reverse', '--format=%H%x00%s%x00%B%x00', `${baseRef}..${headRef}`],
  { cwd, encoding: 'utf8' }
)
```

Parse NUL-delimited records, then read exact `Fork-Customization:` and `Upstream-Backport:` lines from each commit body. `validateCustomizationCoverage` must enforce:

- `active` and `upstream-candidate`: exactly one commit each;
- `retired`: zero commits;
- every observed `ORCAW-NNN`: present in the registry;
- a commit may carry only one `Fork-Customization` trailer;
- backports are reported but are not mistaken for persistent customizations.

Export the pure validator separately from Git subprocess handling.

- [ ] **Step 4: Run focused tests**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-customization-commit-coverage.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the coverage validator**

```bash
git add config/scripts/fork-customization-commit-coverage.mjs config/scripts/fork-customization-commit-coverage.test.mjs
git commit -m "feat: validate fork customization replay coverage"
```

---

### Task 3: Validate stable upstream and Orcaw release versions

**Files:**

- Create: `config/scripts/fork-release-contract.mjs`
- Create: `config/scripts/fork-release-contract.test.mjs`

**Interfaces:**

- Produces: `parseStableUpstreamTag(tag): { version, tag }`
- Produces: `getForkReleaseVersion(upstreamVersion, revision): string`
- Produces: `validateForkRelease({ upstreamTag, upstreamPackageVersion, forkPackageVersion, releaseTag }): string[]`

- [ ] **Step 1: Write failing version tests**

```js
import { describe, expect, it } from 'vitest'
import {
  getForkReleaseVersion,
  parseStableUpstreamTag,
  validateForkRelease
} from './fork-release-contract.mjs'

describe('fork release contract', () => {
  it('accepts only a stable upstream tag', () => {
    expect(parseStableUpstreamTag('v1.4.187')).toEqual({ tag: 'v1.4.187', version: '1.4.187' })
    expect(() => parseStableUpstreamTag('v1.4.187-rc.2')).toThrow('Stable upstream tag required')
    expect(() => parseStableUpstreamTag('1.4.187')).toThrow('Stable upstream tag required')
  })

  it('builds the fork version from the upstream version and positive revision', () => {
    expect(getForkReleaseVersion('1.4.187', 1)).toBe('1.4.187-wyk.1')
    expect(() => getForkReleaseVersion('1.4.187', 0)).toThrow('Fork revision must be positive')
  })

  it('accepts aligned package and release versions', () => {
    expect(
      validateForkRelease({
        upstreamTag: 'v1.4.187',
        upstreamPackageVersion: '1.4.187',
        forkPackageVersion: '1.4.187-wyk.1',
        releaseTag: 'v1.4.187-wyk.1'
      })
    ).toEqual([])
  })

  it('reports mismatched upstream, fork package, and release tag versions', () => {
    expect(
      validateForkRelease({
        upstreamTag: 'v1.4.187',
        upstreamPackageVersion: '1.4.186',
        forkPackageVersion: '1.4.186-wyk.4',
        releaseTag: 'v1.4.187-wyk.1'
      })
    ).toEqual(
      expect.arrayContaining([
        'Upstream package version 1.4.186 does not match v1.4.187',
        'Fork package version must start with 1.4.187-wyk.'
      ])
    )
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-release-contract.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the release contract**

Use exact patterns:

```js
const STABLE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const FORK_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-wyk\.([1-9]\d*)$/
```

`validateForkRelease` must compare all four values rather than trusting the tag alone. Keep it independent of Git subprocesses so the workflow and later replay script can reuse it.

Add two CLI modes:

```bash
node config/scripts/fork-release-contract.mjs --stable-tag v1.4.187
node config/scripts/fork-release-contract.mjs --release \
  v1.4.187 1.4.187 1.4.187-wyk.1 v1.4.187-wyk.1
```

The stable-tag mode only validates the tag. The release mode compares all four values, prints `Fork release contract valid`, and exits nonzero with complete validation errors.

- [ ] **Step 4: Run focused release tests**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-release-contract.test.mjs config/scripts/release-publication-kind.test.mjs
```

Expected: PASS, including the existing rule that `v1.4.187-wyk.1` is a normal release.

- [ ] **Step 5: Commit the release validator**

```bash
git add config/scripts/fork-release-contract.mjs config/scripts/fork-release-contract.test.mjs
git commit -m "feat: validate fork release version alignment"
```

---

### Task 4: Add the manual upstream tracking workflow

**Files:**

- Create: `.github/workflows/fork-upstream-sync.yml`
- Create: `config/scripts/fork-upstream-sync-workflow.test.mjs`

**Interfaces:**

- Consumes: required `workflow_dispatch` input `upstream_tag`
- Consumes: `parseStableUpstreamTag` from `config/scripts/fork-release-contract.mjs` through its CLI
- Produces: fast-forward-only update of `refs/heads/upstream-sync`
- Does not modify: `main`, tags, releases, or customization records

- [ ] **Step 1: Write failing workflow policy tests**

```js
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowPath = '.github/workflows/fork-upstream-sync.yml'

function loadWorkflow() {
  return parse(readFileSync(workflowPath, 'utf8'))
}

describe('fork upstream sync workflow', () => {
  it('is manual and requires an upstream stable tag', () => {
    const workflow = loadWorkflow()
    expect(workflow.on.schedule).toBeUndefined()
    expect(workflow.on.workflow_dispatch.inputs.upstream_tag.required).toBe(true)
  })

  it('fetches the explicit tag and only updates upstream-sync', () => {
    const runText = loadWorkflow().jobs.sync.steps.map((step) => step.run ?? '').join('\n')
    expect(runText).toContain('refs/tags/$UPSTREAM_TAG:refs/tags/$UPSTREAM_TAG')
    expect(runText).toContain('refs/heads/upstream-sync')
    expect(runText).not.toContain('refs/heads/main')
    expect(runText).not.toMatch(/git push[^\n]*--force/)
  })

  it('validates the stable version and fast-forward relationship before push', () => {
    const runText = loadWorkflow().jobs.sync.steps.map((step) => step.run ?? '').join('\n')
    expect(runText).toContain('config/scripts/fork-release-contract.mjs')
    expect(runText).toContain('git merge-base --is-ancestor')
    expect(runText).toContain('git diff --quiet')
  })
})
```

- [ ] **Step 2: Run the workflow test and verify failure**

```bash
pnpm exec vitest run --config config/vitest.config.ts config/scripts/fork-upstream-sync-workflow.test.mjs
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Implement the workflow**

Create `.github/workflows/fork-upstream-sync.yml` with:

- `name: Fork Upstream Sync`;
- `workflow_dispatch` only;
- required string input `upstream_tag`;
- `permissions: contents: write`;
- checkout with `fetch-depth: 0`;
- one Ubuntu job named `sync`;
- environment variable `UPSTREAM_TAG: ${{ inputs.upstream_tag }}`;
- no scheduled trigger.

The shell steps must:

```bash
node config/scripts/fork-release-contract.mjs --stable-tag "$UPSTREAM_TAG"
git remote add upstream https://github.com/stablyai/orca.git
git fetch upstream "refs/tags/$UPSTREAM_TAG:refs/tags/$UPSTREAM_TAG"
git show "$UPSTREAM_TAG:package.json" > /tmp/upstream-package.json
UPSTREAM_VERSION="$(node -p "require('/tmp/upstream-package.json').version")"
node config/scripts/fork-release-contract.mjs --release \
  "$UPSTREAM_TAG" "$UPSTREAM_VERSION" \
  "$UPSTREAM_VERSION-wyk.1" "v$UPSTREAM_VERSION-wyk.1"
```

Fetch `origin/upstream-sync` when it exists and require a fast-forward relationship:

```bash
if git ls-remote --exit-code --heads origin upstream-sync >/dev/null 2>&1; then
  git fetch origin refs/heads/upstream-sync:refs/remotes/origin/upstream-sync
  git merge-base --is-ancestor origin/upstream-sync "$UPSTREAM_TAG"
fi
```

Before pushing, create a temporary local branch at the tag and verify:

```bash
git branch --force upstream-sync-candidate "$UPSTREAM_TAG"
git diff --quiet upstream-sync-candidate "$UPSTREAM_TAG"
git push origin upstream-sync-candidate:refs/heads/upstream-sync
```

The workflow must never push `main`, create a release tag, or use a force option.

- [ ] **Step 4: Run workflow and trigger-policy tests**

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  config/scripts/fork-upstream-sync-workflow.test.mjs \
  config/scripts/fork-workflow-trigger-policy.test.mjs
```

Expected: PASS and no workflow contains a schedule.

- [ ] **Step 5: Commit the workflow**

```bash
git add .github/workflows/fork-upstream-sync.yml config/scripts/fork-upstream-sync-workflow.test.mjs
git commit -m "ci: add manual stable upstream tracking"
```

---

### Task 5: Document and wire the maintenance contract

**Files:**

- Create: `docs/reference/fork-upstream-sync.md`
- Modify: `AGENTS.md:62-71`
- Modify: `package.json:29-36`

**Interfaces:**

- Produces package script: `verify:fork-customizations`
- Produces operator reference for tracking, adoption, retirement, failure, and rollback
- Consumes the validators created in Tasks 1–3

- [ ] **Step 1: Add the static package verifier**

Add to `package.json`:

```json
"verify:fork-customizations": "node config/scripts/fork-customization-registry.mjs FORK_NOTES.md"
```

Add `pnpm run verify:fork-customizations` to the existing `lint` command after the generated-skill checks. Do not add the history coverage check to ordinary lint because pre-migration history does not yet contain trailers and shallow CI checkouts may not have adoption tags.

- [ ] **Step 2: Strengthen the agent fork-maintenance rules**

Replace the branch-model-neutral sentence in `AGENTS.md` with concise rules:

```markdown
- Keep `upstream-sync` identical to a selected stable `stablyai/orca` release; never add downstream commits to it.
- Keep persistent downstream behavior in isolated commits on `main` with a registered `Fork-Customization: ORCAW-NNN` trailer.
- Treat `upstream-candidate` as replay-required until behavioral equivalence is explicitly confirmed; never retire a customization automatically.
- Rewrite `main` only during an approved upstream adoption, preserve a recovery tag, and push only with `--force-with-lease`.
```

Retain the existing requirements for small changes, upstreamable fixes, tests, and `FORK_NOTES.md`.

- [ ] **Step 3: Write the operator reference**

Create `docs/reference/fork-upstream-sync.md` with these exact sections:

```markdown
# Fork Upstream Sync

## Branch responsibilities
## Track a stable upstream release
## Register a customization
## Prepare an adoption candidate
## Resolve or rewrite a customization
## Confirm upstream equivalence
## Validate a candidate
## Replace main safely
## Version and publish
## Abort or roll back
## Initial migration status
```

Document:

- `upstream-sync` can advance ahead of the base used by `main`;
- the manual GitHub workflow only tracks upstream and never adopts it;
- `active` and `upstream-candidate` both remain in the replay set;
- retirement requires behavior comparison, relevant tests, and explicit approval;
- same-base releases increment `wyk.N`; new-base adoption resets to `wyk.1`;
- recovery uses the immutable `archive/pre-sync-*` tag and `--force-with-lease`;
- the current history is legacy until the separate `v1.4.187` adoption plan completes.

Do not duplicate desktop packaging instructions already owned by `FORK_NOTES.md`; link to that section instead.

- [ ] **Step 4: Run documentation and static contract checks**

```bash
pnpm run verify:fork-customizations
pnpm exec vitest run --config config/vitest.config.ts \
  config/scripts/fork-customization-registry.test.mjs \
  config/scripts/fork-customization-commit-coverage.test.mjs \
  config/scripts/fork-release-contract.test.mjs \
  config/scripts/fork-upstream-sync-workflow.test.mjs \
  config/scripts/fork-workflow-trigger-policy.test.mjs
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 5: Commit the maintenance contract**

```bash
git add AGENTS.md package.json docs/reference/fork-upstream-sync.md
git commit -m "docs: define fork synchronization contract"
```

---

### Task 6: Establish the two long-lived remote branches

**Files:**

- No source files
- Remote refs affected: `origin/main`, `origin/upstream-sync`, `origin/custom/main`
- Tags created: `archive/pre-branch-model-v1.4.165-wyk.11`, `archive/legacy-upstream-base-v1.4.165-rc.0`

**Interfaces:**

- Consumes current refs: `origin/main` at upstream `1.4.165-rc.0`, `origin/custom/main` at Orcaw `1.4.165-wyk.11`, and the verified foundation implementation at `HEAD`
- Produces: `origin/main` at the foundation implementation and `origin/upstream-sync` at upstream stable `v1.4.187`
- Preserves: all existing Orcaw release tags and the pre-foundation `origin/custom/main` release state

- [ ] **Step 1: Verify remote state and permissions**

Run:

```bash
gh auth status
gh repo view WYK15/orca --json viewerPermission,defaultBranchRef
git fetch origin --prune --tags
git merge-base --is-ancestor origin/main origin/custom/main
git merge-base --is-ancestor origin/custom/main HEAD
git rev-parse origin/custom/main^{tree}
git rev-parse v1.4.165-wyk.11^{tree}
```

Expected:

- active account is `arch3rPro`;
- repository permission is `WRITE` or `ADMIN`;
- default branch is `custom/main` before migration;
- both ancestry commands exit zero;
- the two tree hashes match, proving the archived release state is intact.

Stop if any expectation fails.

- [ ] **Step 2: Create and push recovery references**

```bash
git tag -a archive/pre-branch-model-v1.4.165-wyk.11 origin/custom/main \
  -m "Archive Orcaw before adopting the two-branch sync model"
git tag -a archive/legacy-upstream-base-v1.4.165-rc.0 \
  e08eba674c195596228834bf3c1ef4f94e6b118e \
  -m "Legacy upstream base before stable-only tracking"
git push origin \
  archive/pre-branch-model-v1.4.165-wyk.11 \
  archive/legacy-upstream-base-v1.4.165-rc.0
```

Expected: both new tags are accepted without changing existing tags.

- [ ] **Step 3: Fast-forward remote `main` to the current Orcaw release**

```bash
FOUNDATION_HEAD="$(git rev-parse HEAD)"
git push origin "$FOUNDATION_HEAD:refs/heads/main"
git fetch origin
test "$(git rev-parse origin/main)" = "$FOUNDATION_HEAD"
```

Expected: `origin/main` equals the verified foundation implementation at `HEAD`. This remains a fast-forward from the old `origin/main`; do not use a force option.

- [ ] **Step 4: Create `upstream-sync` at stable upstream `v1.4.187`**

```bash
git remote get-url upstream >/dev/null 2>&1 || \
  git remote add upstream https://github.com/stablyai/orca.git
git fetch upstream refs/tags/v1.4.187:refs/tags/v1.4.187
git show v1.4.187:package.json | grep '"version": "1.4.187"'
git branch --force upstream-sync v1.4.187
git diff --quiet upstream-sync v1.4.187
git push origin upstream-sync:refs/heads/upstream-sync
```

Expected: package version is exactly `1.4.187` and the new remote branch is created without a force option. If `v1.4.187` is no longer the desired adoption target, stop and write a revised target-specific plan instead of silently substituting another tag.

- [ ] **Step 5: Switch the GitHub default branch and retire the old remote name**

First verify no open pull request targets the old branch:

```bash
gh pr list --repo WYK15/orca --state open --base custom/main --json number
```

Expected: `[]`. If not empty, retarget those pull requests before continuing.

Then run:

```bash
gh repo edit WYK15/orca --default-branch main
git branch --set-upstream-to=origin/main custom/main
git push origin --delete custom/main
```

The local `custom/main` branch may remain while another worktree has it checked out, but it must track `origin/main` and must not recreate `origin/custom/main`. Rename the local branch to `main` later from the worktree that owns it; do not manipulate another worktree's checkout from this workspace.

- [ ] **Step 6: Verify the final remote model**

```bash
gh repo view WYK15/orca --json defaultBranchRef --jq '.defaultBranchRef.name'
git ls-remote --heads origin main upstream-sync custom/main
git diff --quiet origin/upstream-sync v1.4.187
git show origin/main:package.json | grep '"version": "1.4.165-wyk.11"'
git show origin/upstream-sync:package.json | grep '"version": "1.4.187"'
```

Expected:

- default branch is `main`;
- only `main` and `upstream-sync` are returned as the named long-lived branches;
- `upstream-sync` matches `v1.4.187`;
- `main` remains the current releasable Orcaw version.

Do not create `upstream-base/v1.4.187` yet: that tag is created only after `main` actually adopts `v1.4.187`.

---

## Follow-Up Boundary

This plan deliberately stops before replaying the 134 legacy fork-only commits onto `v1.4.187`. After Tasks 1–6 pass, write a separate adoption plan that:

- uses ORCAW-001 through ORCAW-014 as the review units;
- confirms each current `upstream-candidate` against `v1.4.187` before dropping anything;
- omits the 13 historical release commits and confirmed included upstream backports;
- rewrites conflicts by domain rather than resolving a single 97-file merge;
- adds one `Fork-Customization` trailer per curated customization commit;
- sets `package.json` to `1.4.187-wyk.1` only after successful replay and verification;
- creates `upstream-base/v1.4.187` and `v1.4.187-wyk.1` only after approval.
