# Upstream PR Backports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve three upstream PRs on focused backport branches and integrate them into `custom/main`.

**Architecture:** Every PR starts from `docs/fork-maintenance-guidance` and retains its original commits. The aggregate branch merges the Windows fix first, then Markdown table resizing, then Markdown table structure actions.

**Tech Stack:** Git 2.25-compatible commands, pnpm, Vitest, TypeScript, Electron/Vite

## Global Constraints

- Work only in `/Users/wangyankun/Documents/ProjectTools/orca`.
- Preserve the original upstream commit authors and commit boundaries.
- Never discard unrelated user or upstream changes.
- Never add a `max-lines` disable or per-file max-lines bump.
- UI changes must follow `docs/STYLEGUIDE.md` and existing CSS tokens and shadcn primitives.
- Keep macOS, Linux, Windows, SSH hosts, folder workspaces, and Git 2.25 compatibility intact.
- Compare full-suite results against the 44,107 passed, 15 failed, and 81 skipped baseline.

---

### Task 1: Backport Windows PATH ordering

**Files:**
- Modify through cherry-pick: `src/main/pty/windows-environment-path.ts`
- Test through cherry-pick: `src/main/pty/windows-environment-path.test.ts`

**Interfaces:**
- Consumes: upstream commit `84847590314af37b1274fa34599e07245730fd07`
- Produces: branch `backport/pr-12050-windows-path-ordering`

- [ ] **Step 1: Create the focused branch**

```bash
git switch docs/fork-maintenance-guidance
git status --short
git switch -c backport/pr-12050-windows-path-ordering
```

Expected: the status is clean before branch creation.

- [ ] **Step 2: Apply the original upstream commit**

```bash
git cherry-pick 84847590314af37b1274fa34599e07245730fd07
```

Expected: one commit is applied with the original author and message.

- [ ] **Step 3: Run the focused Windows environment test**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/pty/windows-environment-path.test.ts
```

Expected: PASS.

- [ ] **Step 4: Verify the branch**

```bash
git status --short
git log -1 --format='%H %an <%ae> %s'
```

Expected: clean status and the upstream commit identity.

### Task 2: Backport Markdown table resizing

**Files:**
- Modify through cherry-pick: `src/renderer/src/assets/main.css`
- Modify through cherry-pick: `src/renderer/src/assets/rich-markdown-editor.css`
- Modify through cherry-pick: `src/renderer/src/components/editor/rich-markdown-extensions.ts`
- Test through cherry-pick: `src/renderer/src/assets/rich-markdown-table-style.test.ts`
- Test through cherry-pick: `src/renderer/src/components/editor/rich-markdown-table-resize.test.ts`

**Interfaces:**
- Consumes: upstream commits `2c7610464`, `efc526a3c`, and `9ba3468a6`
- Produces: branch `backport/pr-12048-markdown-table-resize`

- [ ] **Step 1: Create the focused branch from the common base**

```bash
git switch docs/fork-maintenance-guidance
git switch -c backport/pr-12048-markdown-table-resize
```

- [ ] **Step 2: Apply the original commits in order**

```bash
git cherry-pick 2c7610464 efc526a3c 9ba3468a6
```

Expected: three commits are applied without squashing.

- [ ] **Step 3: Review the style contract**

```bash
git diff docs/fork-maintenance-guidance...HEAD -- src/renderer/src/assets/main.css src/renderer/src/assets/rich-markdown-editor.css
rg -n "#[0-9A-Fa-f]{3,8}|rgba?\\(" src/renderer/src/assets/main.css src/renderer/src/assets/rich-markdown-editor.css
```

Expected: the diff uses documented tokens or already-established values; no new undocumented color is introduced.

- [ ] **Step 4: Run the focused resize tests**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/assets/rich-markdown-table-style.test.ts src/renderer/src/components/editor/rich-markdown-table-resize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify the branch**

```bash
git status --short
git log -3 --format='%h %an <%ae> %s'
```

Expected: clean status and three upstream-authored commits.

### Task 3: Backport Markdown table structure actions

**Files:**
- Modify through cherry-pick: `src/main/window/createMainWindow.ts`
- Modify through cherry-pick: `src/main/window/editable-context-menu.ts`
- Modify through cherry-pick: `src/renderer/src/components/editor/RichMarkdownTableToolbar.tsx`
- Modify through cherry-pick: `src/renderer/src/components/editor/RichMarkdownToolbar.tsx`
- Modify through cherry-pick: `src/renderer/src/components/editor/rich-markdown-context-command-routing.ts`
- Modify through cherry-pick: `src/renderer/src/components/editor/rich-markdown-table-actions.ts`
- Modify through cherry-pick: `src/renderer/src/i18n/locales/en.json`
- Modify through cherry-pick: `src/shared/rich-markdown-context-menu.ts`
- Test through cherry-pick: `src/main/window/createMainWindow.test.ts`
- Test through cherry-pick: `src/main/window/editable-context-menu.test.ts`
- Test through cherry-pick: `src/renderer/src/components/editor/RichMarkdownTableToolbar.test.tsx`
- Test through cherry-pick: `src/renderer/src/components/editor/rich-markdown-table-actions.test.ts`

**Interfaces:**
- Consumes: upstream commits `69c6644fc` and `b35b231c5`
- Produces: branch `backport/pr-11985-markdown-table-actions`

- [ ] **Step 1: Create the focused branch from the common base**

```bash
git switch docs/fork-maintenance-guidance
git switch -c backport/pr-11985-markdown-table-actions
```

- [ ] **Step 2: Apply the original commits in order**

```bash
git cherry-pick 69c6644fc b35b231c5
```

Expected: two commits are applied without squashing.

- [ ] **Step 3: Run the focused action and context-menu tests**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/window/createMainWindow.test.ts src/main/window/editable-context-menu.test.ts src/renderer/src/components/editor/RichMarkdownTableToolbar.test.tsx src/renderer/src/components/editor/rich-markdown-table-actions.test.ts
```

Expected: PASS.

- [ ] **Step 4: Verify localization and branch state**

```bash
pnpm run verify:localization-catalog
git status --short
git log -2 --format='%h %an <%ae> %s'
```

Expected: localization verification passes, the status is clean, and both commits retain their upstream authors.

### Task 4: Assemble the long-lived fork branch

**Files:**
- Integrate: all files from Tasks 1–3

**Interfaces:**
- Consumes: the three `backport/pr-*` branches
- Produces: branch `custom/main`

- [ ] **Step 1: Confirm the target branch name is available**

```bash
git branch --list custom/main
```

Expected: no output. If it exists, stop and inspect it instead of replacing it.

- [ ] **Step 2: Create the aggregate branch**

```bash
git switch docs/fork-maintenance-guidance
git switch -c custom/main
```

- [ ] **Step 3: Merge the focused branches**

```bash
git merge --no-ff backport/pr-12050-windows-path-ordering -m "merge: backport upstream PR 12050"
git merge --no-ff backport/pr-12048-markdown-table-resize -m "merge: backport upstream PR 12048"
git merge --no-ff backport/pr-11985-markdown-table-actions -m "merge: backport upstream PR 11985"
```

Expected: all three merges complete without conflicts.

- [ ] **Step 4: Run the combined focused suite**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/pty/windows-environment-path.test.ts src/main/window/createMainWindow.test.ts src/main/window/editable-context-menu.test.ts src/renderer/src/assets/rich-markdown-table-style.test.ts src/renderer/src/components/editor/rich-markdown-table-resize.test.ts src/renderer/src/components/editor/RichMarkdownTableToolbar.test.tsx src/renderer/src/components/editor/rich-markdown-table-actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run static and desktop build verification**

```bash
pnpm run typecheck
pnpm run build:desktop
git diff --check docs/fork-maintenance-guidance...HEAD
```

Expected: all commands succeed.

- [ ] **Step 6: Run the full test suite and compare the baseline**

```bash
pnpm test
```

Expected: no new failing test beyond the recorded baseline. Record exact pass, fail, and skip counts.

### Task 5: Record the backports

**Files:**
- Create: `FORK_NOTES.md`

**Interfaces:**
- Consumes: the merged upstream PR identities
- Produces: a maintained record that can be pruned after future upstream syncs

- [ ] **Step 1: Add the persistent-difference record**

```markdown
# Fork Notes

## Backported upstream changes

- stablyai/orca#12050 — Windows persisted PATH ordering.
- stablyai/orca#12048 — resizable responsive Markdown tables.
- stablyai/orca#11985 — Markdown table structure controls.

Remove an entry after an upstream sync contains its equivalent commits.
```

- [ ] **Step 2: Commit the record**

```bash
git add FORK_NOTES.md
git commit -m "docs: record upstream PR backports"
```

- [ ] **Step 3: Verify the aggregate history**

```bash
git status --short
git log --graph --oneline --decorate -15
```

Expected: clean status with separate merge commits and a focused fork-notes commit.
