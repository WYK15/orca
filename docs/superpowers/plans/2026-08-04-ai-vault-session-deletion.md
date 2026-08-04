# AI Vault Session Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the reviewed AI Vault session-deletion implementation from stablyai/orca#10249 into Orcaw and verify that supported local provider sessions can be removed safely.

**Architecture:** Preserve the contributor branch as an explicit merge so its provider-specific validation, filesystem executor, IPC boundary, renderer affordance, and tests remain attributable to the upstream PR. Validate the final merged tree against Orcaw's current customizations, then record the temporary backport in `FORK_NOTES.md`.

**Tech Stack:** Electron, TypeScript, React, Vitest, Playwright, pnpm, Git

## Global Constraints

- Work only in the primary working directory on `custom/main`.
- Preserve the PR's commits and provenance; do not squash or rewrite them.
- Support real deletion only for Gemini, Copilot, Cursor, Hermes, Devin, OpenClaw, Droid, Pi, OMP, Claude, Rovo, and Grok.
- Keep Antigravity, Kimi, Codex, OpenCode, running sessions, synthetic paths, SSH sessions, and runtime-host sessions non-deletable.
- Native local targets use `shell.trashItem`; WSL UNC removal uses the existing WSL path and must not promise recoverability.
- Treat renderer IPC payloads as untrusted and retain provider-root, discovery-predicate, file-kind, realpath, and shared-root guards.
- Follow `docs/STYLEGUIDE.md`, canonical CSS tokens, and existing shadcn primitives.
- Never add a `max-lines` disable or per-file max-lines increase.
- Do not modify vague `helpers`, `utils`, `common`, or `misc` modules.
- Run only focused AI Vault verification plus affected type, localization, and changed-code checks.
- Do not push without explicit user instruction.

---

## File Map

The merge creates the following focused domains:

- `src/shared/ai-vault-session-deletion.ts`: shared provider capability and IPC argument/result contracts.
- `src/main/ai-vault/session-delete-target.ts`: pure provider-specific removal-plan validation.
- `src/main/ai-vault/session-delete.ts`: filesystem guards and ordered trash/removal execution.
- `src/main/ipc/ai-vault-delete.ts`: delete orchestration and cache invalidation.
- `src/main/ipc/ai-vault-subagent-list.ts`: extracted subagent listing required to keep the IPC module within its line budget.
- `src/renderer/src/components/right-sidebar/ai-vault-session-deletability.ts`: renderer-only action availability.
- `src/renderer/src/components/right-sidebar/ai-vault-session-delete-reason.ts`: accessible disabled-state copy.
- `src/renderer/src/components/right-sidebar/ai-vault-session-delete-action.ts`: confirmation state and IPC result handling.
- `src/renderer/src/components/right-sidebar/AiVaultSessionDeleteDialog.tsx`: destructive confirmation UI.

The merge also wires these domains into the scanner, IPC/preload APIs, AI Vault
panel and menus, locale catalogs, focused unit tests, and
`tests/e2e/ai-vault-session-delete.spec.ts`.

### Task 1: Merge the reviewed contributor branch

**Files:**
- Merge: `refs/remotes/contrib/ai-vault-session-delete`
- Preserve: all 39 files in stablyai/orca#10249

**Interfaces:**
- Consumes: common base `95c431f5c356d7545aec7f422c43514831b46ebf`
- Produces: an explicit merge commit on `custom/main` containing PR head `1cbaa8be5ae12a4e75923a9c0ac51e417a216e39`

- [ ] **Step 1: Verify branch, worktree, and contributor ref**

Run:

```bash
git status --short --branch
git rev-parse custom/main
git rev-parse refs/remotes/contrib/ai-vault-session-delete
git merge-base custom/main refs/remotes/contrib/ai-vault-session-delete
```

Expected: `custom/main` is checked out; only the pre-existing untracked
`.superpowers/` directory may be present; contributor head is
`1cbaa8be5ae12a4e75923a9c0ac51e417a216e39`; merge base is
`95c431f5c356d7545aec7f422c43514831b46ebf`.

- [ ] **Step 2: Reconfirm the merge is conflict-free**

Run:

```bash
git merge-tree --write-tree custom/main refs/remotes/contrib/ai-vault-session-delete
```

Expected: exit code 0 and one resulting tree object ID, with no conflict
messages.

- [ ] **Step 3: Merge with explicit provenance**

Run:

```bash
git merge --no-ff refs/remotes/contrib/ai-vault-session-delete -m "Merge stablyai/orca#10249: delete AI Vault sessions"
```

Expected: one merge commit with `custom/main` and the contributor PR head as its
two parents.

- [ ] **Step 4: Verify merge shape and scope**

Run:

```bash
git show --no-patch --format='%H%n%P%n%s' HEAD
git diff --stat HEAD^1..HEAD
git status --short
```

Expected: the second parent is
`1cbaa8be5ae12a4e75923a9c0ac51e417a216e39`; the diff contains the PR's 39
AI Vault, preload, locale, and E2E files; no tracked worktree changes remain.

### Task 2: Run focused behavioral verification

**Files:**
- Test: `src/main/ai-vault/cached-session-list.test.ts`
- Test: `src/main/ai-vault/session-delete-target.test.ts`
- Test: `src/main/ai-vault/session-delete.test.ts`
- Test: `src/main/ipc/ai-vault.test.ts`
- Test: `src/renderer/src/components/right-sidebar/AiVaultSessionRow.test.tsx`
- Test: `src/renderer/src/components/right-sidebar/SessionRowTrailingActions.test.tsx`
- Test: `src/renderer/src/components/right-sidebar/ai-vault-session-deletability.test.ts`
- Test: `src/renderer/src/components/right-sidebar/ai-vault-session-delete-action.test.tsx`
- Test: `src/renderer/src/components/right-sidebar/ai-vault-session-delete-reason.test.ts`
- Test: `tests/e2e/ai-vault-session-delete.spec.ts`

**Interfaces:**
- Consumes: the merged deletion contracts and IPC bridge from Task 1
- Produces: evidence that validation, removal, cache invalidation, UI state, and isolated on-disk deletion work on the Orcaw tree

- [ ] **Step 1: Prepare the Node native runtime**

Run:

```bash
node config/scripts/ensure-native-runtime.mjs --runtime=node
```

Expected: exit code 0.

- [ ] **Step 2: Run only the affected unit suites**

Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/ai-vault/cached-session-list.test.ts \
  src/main/ai-vault/session-delete-target.test.ts \
  src/main/ai-vault/session-delete.test.ts \
  src/main/ipc/ai-vault.test.ts \
  src/renderer/src/components/right-sidebar/AiVaultSessionRow.test.tsx \
  src/renderer/src/components/right-sidebar/SessionRowTrailingActions.test.tsx \
  src/renderer/src/components/right-sidebar/ai-vault-session-deletability.test.ts \
  src/renderer/src/components/right-sidebar/ai-vault-session-delete-action.test.tsx \
  src/renderer/src/components/right-sidebar/ai-vault-session-delete-reason.test.ts
```

Expected: every listed suite passes.

- [ ] **Step 3: Run affected TypeScript checks**

Run:

```bash
pnpm typecheck:node
pnpm typecheck:web
```

Expected: both commands exit 0.

- [ ] **Step 4: Run changed-code and structural checks**

Run:

```bash
git diff --name-only HEAD^1..HEAD -- '*.ts' '*.tsx' | xargs pnpm exec oxlint
pnpm run check:max-lines-ratchet
pnpm run verify:localization-catalog
pnpm run verify:localization-extraction
pnpm run verify:localization-coverage
```

Expected: every command exits 0; no lint suppression or max-lines exception is
introduced.

- [ ] **Step 5: Run the single destructive-path E2E spec in its isolated home**

Run:

```bash
pnpm run ensure:electron-runtime
pnpm exec playwright test tests/e2e/ai-vault-session-delete.spec.ts \
  --config tests/playwright.config.ts \
  --project electron-headless \
  --workers=1
```

Expected: the Gemini file and Claude transcript/session companions disappear
from the disposable E2E home, Claude file-history remains, and the spec passes.
The test must never use the user's real provider home.

### Task 3: Record the temporary fork backport

**Files:**
- Modify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: verified merge commit from Tasks 1–2
- Produces: maintenance guidance that removes the entry once upstream contains the same commits

- [ ] **Step 1: Add the backport entry**

Insert under `## Backported upstream changes`:

```markdown
- [stablyai/orca#10249](https://github.com/stablyai/orca/pull/10249) — safe
  deletion of supported local Agent Session History entries.
```

- [ ] **Step 2: Verify the documentation diff**

Run:

```bash
git diff --check
git diff -- FORK_NOTES.md
```

Expected: only the new PR #10249 entry appears and whitespace validation passes.

- [ ] **Step 3: Commit the fork note**

Run:

```bash
git add FORK_NOTES.md
git commit -m "docs: record AI Vault deletion backport"
```

Expected: one documentation commit containing only `FORK_NOTES.md`.

### Task 4: Verify the final branch state

**Files:**
- Inspect: merge and documentation commits

**Interfaces:**
- Consumes: all earlier tasks
- Produces: a clean, locally committed branch ready for an explicit future push

- [ ] **Step 1: Confirm tracked cleanliness and commit history**

Run:

```bash
git status --short --branch
git log --oneline --decorate --max-count=8
```

Expected: no tracked changes; `.superpowers/` remains untracked and untouched;
the fork-note commit follows the explicit PR merge commit.

- [ ] **Step 2: Confirm the merged contracts are present**

Run:

```bash
rg -n "AI_VAULT_DELETABLE_AGENTS|deleteSession|AiVaultSessionDeleteDialog" \
  src/shared \
  src/main \
  src/preload \
  src/renderer/src
```

Expected: capability data, main-process validation/execution, preload bridge,
and renderer dialog/action wiring are all discoverable.

- [ ] **Step 3: Report verification without pushing**

Report the merge commit, documentation commit, exact focused checks and their
results, any skipped check with its concrete reason, and that the branch remains
local and ahead of `origin/custom/main`.
