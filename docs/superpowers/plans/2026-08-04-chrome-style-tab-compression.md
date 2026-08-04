# Chrome-Style Tab Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let all desktop workspace tabs shrink evenly to 72px before the existing horizontal overflow navigation begins.

**Architecture:** Change the single shared tab width class used by terminal, editor, browser, and simulator wrappers. Preserve the existing flex sizing, scroll metrics, active-tab reveal, drag behavior, and visual treatment; update the existing component-level contract test and fork maintenance note.

**Tech Stack:** React, TypeScript, Tailwind utility classes, Vitest, server-side React rendering

## Global Constraints

- Default preferred width remains 180px.
- Preferred width at viewports of at least 1280px remains 220px.
- Maximum width remains 280px.
- Minimum width changes from 88px to 72px.
- Every visible tab in a strip participates in the same flex sizing.
- Width ownership remains on the outer sortable container, not the interactive tab root.
- Do not alter labels, icons, close controls, pinned state, rename behavior, drag and drop, split panes, or overflow navigation.
- Introduce no new colors, spacing tokens, typography, shadows, or component primitives.
- Run only focused tab width/title tests and changed-file checks; skip unrelated relay, PTY, SSH, and Electron integration suites.

---

### Task 1: Shared 72px Tab Width Floor

**Files:**
- Modify: `src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx:189`
- Modify: `src/renderer/src/components/tab-bar/tab-width-rules.ts:3`

**Interfaces:**
- Consumes: `TAB_CONTAINER_WIDTH_CLASSES`, shared by `SortableTab`, `EditorFileTab`, and `BrowserTab`.
- Produces: The class contract `min-w-[72px] max-w-[280px] flex-[1_1_180px] min-[1280px]:flex-[1_1_220px]` for every desktop tab wrapper.

- [ ] **Step 1: Change the rendered-component expectation to 72px**

Update `expectTabContainerWidth` before changing production code:

```tsx
function expectTabContainerWidth(markup: string, root: string): void {
  const container = firstOpeningTag(markup)
  const widthClasses = 'min-w-[72px] max-w-[280px] flex-[1_1_180px] min-[1280px]:flex-[1_1_220px]'
  expect(container).toContain(widthClasses)
  expect(root).not.toContain('min-w-[72px]')
  expect(root).not.toContain('max-w-[280px]')
  expect(root).not.toContain('flex-[1_1_180px]')
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx \
  --pool=threads \
  --maxWorkers=1
```

Expected: the terminal, browser, and editor cases fail because rendered wrappers
still contain `min-w-[88px]` instead of `min-w-[72px]`.

- [ ] **Step 3: Change the shared production width floor**

Update only the shared constant:

```ts
export const TAB_CONTAINER_WIDTH_CLASSES =
  'min-w-[72px] max-w-[280px] flex-[1_1_180px] min-[1280px]:flex-[1_1_220px]'
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx \
  --pool=threads \
  --maxWorkers=1
```

Expected: all tests in `tab-title-tooltip.test.tsx` pass, including terminal,
browser, and editor wrapper width checks.

- [ ] **Step 5: Check formatting and commit the behavior**

Run:

```bash
git diff --check
git add \
  src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx \
  src/renderer/src/components/tab-bar/tab-width-rules.ts
git commit -m "feat(tabs): compress crowded tabs to 72px"
```

### Task 2: Record the Fork Customization

**Files:**
- Modify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: The 72px width floor implemented in Task 1.
- Produces: A durable downstream-maintenance note for future upstream syncs.

- [ ] **Step 1: Add a persistent customization section**

Add this section before `Fork desktop packages`:

```markdown
## Persistent customizations

- Desktop workspace tabs shrink evenly to a 72px minimum before horizontal
  overflow, instead of upstream's 88px minimum.
```

- [ ] **Step 2: Run the root guard and focused tab test**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx \
  config/scripts/check-root-directory-entries.test.mjs \
  --pool=threads \
  --maxWorkers=1
git diff --check
```

Expected: both test files pass and the diff has no whitespace errors.

- [ ] **Step 3: Commit the maintenance note**

Run:

```bash
git add FORK_NOTES.md
git commit -m "docs: record custom tab compression floor"
```

### Task 3: Final Focused Verification

**Files:**
- Verify: `src/renderer/src/components/tab-bar/tab-width-rules.ts`
- Verify: `src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx`
- Verify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: Evidence that the focused customization is ready to integrate.

- [ ] **Step 1: Re-run the complete focused verification**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx \
  config/scripts/check-root-directory-entries.test.mjs \
  --pool=threads \
  --maxWorkers=1
git diff --check HEAD~2
```

Expected: both test files pass and the two implementation commits have no
whitespace errors.

- [ ] **Step 2: Inspect scope without staging visual companion files**

Run:

```bash
git diff --name-only HEAD~2..HEAD
git status --short --branch
git log -5 --oneline
```

Expected: the two implementation commits contain only the shared width rule,
its existing test, and `FORK_NOTES.md`. `.superpowers/` may remain untracked
while the approved visual brainstorming session is active and must not be
staged.

- [ ] **Step 3: Push only after explicit user approval**

Run:

```bash
git push origin custom/main
```

Expected: `origin/custom/main` advances to the verified implementation commit.
Do not create a release tag as part of this feature.
