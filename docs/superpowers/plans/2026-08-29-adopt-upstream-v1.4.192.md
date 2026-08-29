# Adopt Upstream v1.4.192

**Goal:** Replace Orcaw's v1.4.187 base with `v1.4.192` while preserving every registered customization and publishing `v1.4.192-wyk.1`.

**Architecture:** `upstream-sync` already matches `v1.4.192`. Replay the curated Orcaw layer from `main` onto that branch in an isolated candidate, with one `Fork-Customization` trailer per active or upstream-candidate registry entry. `FORK_NOTES.md` owns customization contracts; this plan owns commit disposition, replay order, and verification.

**Prerequisites:** Explicit approval to replace `main`; a clean candidate worktree; `origin/upstream-sync` equal to `v1.4.192`; and a release credential path that can update workflow files when future upstream tracking requires it.

## Recorded coverage reconciliation

The current v1.4.187 layer contains recent corrections that must be represented in the replay rather than copied mechanically:

| Source commit | Disposition in v1.4.192 candidate |
| --- | --- |
| `03bdb85937` safe project removal and worktree deletion | Rewrite as the sole `ORCAW-016` commit. The source commit has no trailer, so current coverage reports `ORCAW-016 appears in 0 commits`; the candidate must correct this. |
| `76095d516` macOS signing and notarization recovery | Fold into the sole `ORCAW-002` replay while retaining signed, notarized ShipIt delivery. |
| `3cbf022d7`, `5af626604`, `c1e4b588d`, `ac4b43fe0` governance, audit, and upstream tracking updates | Fold into the sole `ORCAW-015` replay. Do not add a second ORCAW-015 trailer. |
| `99da39d62c` test-fixture security allowlist | Audit each hunk and fold every required allowance into its owning registered customization. Do not retain an untrailed persistent compatibility commit. |
| `7ff96d5fe` v1.4.187 release version | Drop. Create one new release-version commit for `1.4.192-wyk.1` after customization validation. |

No customization is retired by this plan. A registry contract is not proof of replay coverage; the candidate must pass the exact-one trailer check.

## Replay matrix

| ID | Replay treatment | Required verification |
| --- | --- | --- |
| ORCAW-001 | Rewrite identity, updater, CLI, and platform helper integration around current upstream interfaces. | Product identity, updater, CLI installer, native-runtime checks. |
| ORCAW-002 | Rewrite desktop packaging and release delivery; preserve signed/notarized macOS, fork assets, tag/version gates, and disabled inherited schedules. | Desktop-package workflow, macOS release-environment, release-contract, publication-kind, and trigger-policy tests. |
| ORCAW-003 | Replay the tab-width contract; upstream overlap is not expected. | Tab title/width test. |
| ORCAW-004 | Replay table controls and audit structural UI hunks. Existing backport evidence does not authorize retirement. | Table insertion/menu and retained resize/control tests. |
| ORCAW-005 | Resolve dependency and lockfile changes while preserving safe HTML source/node-view behavior. | Safe HTML source and node-view tests. |
| ORCAW-006 | Audit browser title handling against current browser-pane structure; retain stale-event and active-worktree guarantees. | Browser title-event test and affected browser-pane checks. |
| ORCAW-007 | Merge Chinese editor labels with current upstream locale additions. | Chinese menu/localization test. |
| ORCAW-008 | Rewrite agent-hook behavior across local, WSL, and remote interfaces; do not use mechanical conflict resolution. | Managed-runtime, remote installer, WSL relay, and affected provider tests. |
| ORCAW-009 | Preserve complete Codex and bulk deletion semantics while auditing shared IPC, locale, and deletion-type changes. | Codex deletion, IPC, selection, action, and bulk-deletion tests. |
| ORCAW-010 | Retain non-authoritative failed WSL scans and terminal preservation around current worktree scanning. | Worktree, graph/scan-cache, and IPC tests. |
| ORCAW-011 | Retain the bounded Linux relay process scan. | Relay shell utility test. |
| ORCAW-012 | Rebase remote transcript cache fixtures on the current scanner contract. | Remote session scanner and cache tests. |
| ORCAW-013 | Preserve Windows-normalized file identity while integrating current tab kinds and focus behavior. | Editor identity, tabs, and reconciliation tests. |
| ORCAW-014 | Rewrite Markdown source editing, outline, and inline editing around current editor lifecycle composition. | Source editor, table-of-contents, inline-input, and editor lifecycle tests. |
| ORCAW-015 | Consolidate registry, coverage, release, and controlled upstream-tracking governance into one trailer-bearing replay. | Registry, coverage, release-contract, and upstream-sync workflow tests. |
| ORCAW-016 | Rewrite the deletion lifecycle around current sidebar seams and add the missing trailer. Preserve non-destructive project removal, distinct child-worktree deletion, and confirmation. Include `worktree-delete-request.ts`. | Worktree context-menu, delete-flow, delete-intent, and Chinese locale tests. |

Create a v1.4.192 hunk audit beside the existing legacy audit for every registered customization and every hunk folded from the recorded coverage reconciliation. Record each selected hunk as replayed, upstream-equivalent with evidence, retired after approval, or intentionally not replayed. Similar source structure or a clean patch does not establish equivalence.

## Candidate procedure

1. Fetch `origin`, `upstream`, and tags. Verify `origin/upstream-sync` and `v1.4.192` have identical trees.
2. Create and push `archive/pre-sync-v1.4.187-wyk.3` at the observed `origin/main` tip.
3. Create `sync/v1.4.192-wyk.1` from `origin/main` in a clean isolated worktree.
4. Rebase the v1.4.187 downstream range onto `origin/upstream-sync`. Drop the old release commit and curate the remaining commits according to the recorded reconciliation table.
5. Replay or rewrite one customization at a time. Run its focused tests before continuing. Preserve exactly one trailer for each registry entry.
6. Resolve generated dependency artifacts only after their owning source changes are settled.
7. Write the v1.4.192 hunk audit, record all dispositions before any retirement decision, and pass registry and exact-one replay coverage validation.
8. Only after step 7 passes, create one release-version commit with `package.json` set to `1.4.192-wyk.1` and update release examples that name the current version.

## Validation and publication

Run:

```bash
pnpm run verify:fork-customizations
pnpm run verify:fork-replay -- FORK_NOTES.md v1.4.192 HEAD
node config/scripts/fork-release-contract.mjs --release \
  v1.4.192 1.4.192 1.4.192-wyk.1 v1.4.192-wyk.1
```

Then run the focused tests from every replay matrix row, the relevant type/lint checks, and inspect:

```bash
git range-diff v1.4.187..origin/main v1.4.192..HEAD
git diff --check
```

Build desktop packages before replacing `main`. Verify Orcaw asset names, updater manifests and blockmaps, macOS Developer ID signing and notarization, and the documented unsigned-Windows behavior.

Immediately before replacement, fetch `origin/main` and force-with-lease the candidate only if its observed remote tip is unchanged. Fetch `origin/main` again and verify it equals the candidate before creating immutable `upstream-base/v1.4.192`, then push `v1.4.192-wyk.1` to publish.

## Abort and rollback

Before `main` replacement, delete only the candidate branch and worktree. After replacement, restore `archive/pre-sync-v1.4.187-wyk.3` with an observed `--force-with-lease`. Never move recovery, upstream-base, or published release tags.
