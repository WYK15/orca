# Fork Notes

## Backported upstream changes

- [stablyai/orca#12050](https://github.com/stablyai/orca/pull/12050) — Windows persisted PATH ordering.
- [stablyai/orca#12048](https://github.com/stablyai/orca/pull/12048) — resizable responsive Markdown tables.
- [stablyai/orca#11985](https://github.com/stablyai/orca/pull/11985) — Markdown table structure controls.
- [stablyai/orca#10249](https://github.com/stablyai/orca/pull/10249) — safe
  deletion of supported local Agent Session History entries.

Remove an entry after an upstream sync contains its equivalent commits.

## Customization Registry

| ID | Title | Status | Introduced | Contract | Scope | Verification | Upstream |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ORCAW-001 | Independent desktop identity and update channel | active | 1.4.165-wyk.4 | Preserve Orcaw identity, isolated user data, CLI/helper names, and fork-scoped updates | `config/orcaw-product-identity.json`, `config/electron-builder.config.cjs`, `src/main/updater-delivery-policy.ts`, `src/shared/orca-cli-command-name.ts` | `config/scripts/electron-builder-product-identity.test.mjs`, `src/main/updater-delivery-policy.test.ts`, `src/main/cli/cli-installer.test.ts` | none |
| ORCAW-002 | Fork-owned desktop release delivery | active | 1.4.165-wyk.4 | Preserve fork package assets, signed and notarized macOS release delivery, tag/version validation, and disabled inherited schedules | `.github/workflows/fork-desktop-packages.yml`, `config/scripts/fork-release-contract.mjs`, `config/scripts/release-publication-kind.mjs` | `config/scripts/fork-desktop-packages-workflow.test.mjs`, `config/scripts/verify-macos-release-env.test.mjs`, `config/scripts/fork-release-contract.test.mjs`, `config/scripts/fork-workflow-trigger-policy.test.mjs`, `config/scripts/release-publication-kind.test.mjs` | none |
| ORCAW-003 | Workspace-tab compression floor | active | 1.4.165-wyk.4 | Keep workspace tabs at a 72px minimum before overflow | `src/renderer/src/components/tab-bar/tab-width-rules.ts` | `src/renderer/src/components/tab-bar/tab-title-tooltip.test.tsx` | none |
| ORCAW-004 | Rich-Markdown table insertion controls | active | 1.4.165-wyk.4 | Preserve the 10×10 grid, validated custom size, and header/body insertion semantics | `src/renderer/src/components/editor/RichMarkdownTableInsertMenu.tsx`, `src/renderer/src/components/editor/rich-markdown-table-insertion.ts` | `src/renderer/src/components/editor/RichMarkdownTableInsertMenu.test.tsx`, `src/renderer/src/components/editor/rich-markdown-table-insertion.test.ts` | none |
| ORCAW-005 | Bounded safe rich-Markdown HTML | active | 1.4.165-wyk.4 | Render and source-edit the safe allowlist while preserving unsupported HTML losslessly | `src/renderer/src/components/editor/rich-markdown-safe-html-source.ts`, `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.ts` | `src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts`, `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.test.ts` | none |
| ORCAW-006 | Browser title stability | upstream-candidate | 1.4.165-wyk.5 | Ignore stale title events and preserve the active worktree page title | `src/renderer/src/components/browser-pane/browser-page-title-event.ts`, `src/renderer/src/components/browser-pane/BrowserPane.tsx` | `src/renderer/src/components/browser-pane/browser-page-title-event.test.ts` | pending upstream review |
| ORCAW-007 | Chinese editor localization | upstream-candidate | 1.4.165-wyk.5 | Preserve Chinese rich-Markdown editor and menu labels | `src/renderer/src/i18n/locales/zh.json` | `src/renderer/src/i18n/zh-menu-action-localization.test.ts` | pending upstream review |
| ORCAW-008 | Agent-hook configuration safety | upstream-candidate | 1.4.165-wyk.6 | Fail closed without detected agents and preserve safe local, WSL, and remote hook updates | `src/main/agent-hooks/managed-hook-runtime.ts`, `src/main/agent-hooks/remote-managed-hook-installers.ts` | `src/main/agent-hooks/managed-hook-runtime.test.ts`, `src/main/agent-hooks/remote-hook-service-installers.test.ts`, `src/main/agent-hooks/wsl-hook-relay-manager.test.ts` | pending upstream review |
| ORCAW-009 | Complete Codex and bulk AI Vault deletion | upstream-candidate | 1.4.165-wyk.6 | Delete complete supported Codex sessions and preserve multi-session deletion | `src/main/ai-vault/codex-session-delete.ts`, `src/main/ipc/ai-vault-delete.ts`, `src/renderer/src/components/right-sidebar/ai-vault-session-delete-action.ts` | `src/main/ai-vault/codex-session-delete.test.ts`, `src/main/ipc/ai-vault.test.ts`, `src/renderer/src/components/right-sidebar/AiVaultSessionRow.test.tsx` | pending upstream review |
| ORCAW-010 | WSL failed-scan terminal preservation | upstream-candidate | 1.4.165-wyk.8 | Preserve existing terminals when WSL worktree scanning fails | `src/main/git/worktree.ts` | `src/main/git/worktree-scan-cache-sharing.test.ts`, `src/main/ipc/worktrees-detected-scan-cache.test.ts` | pending upstream review |
| ORCAW-011 | Linux relay process-scan bound | upstream-candidate | 1.4.165-wyk.8 | Avoid procfs-wide `pgrep` scans during Linux relay handling | `src/relay/pty-shell-utils.ts` | `src/relay/pty-shell-utils.test.ts` | pending upstream review |
| ORCAW-012 | Remote transcript parse cache | upstream-candidate | 1.4.165-wyk.8 | Reuse unchanged remote AI Vault transcript parses | `src/main/ai-vault/remote-session-parse-cache.ts`, `src/main/ai-vault/remote-session-scanner.ts` | `src/main/ai-vault/remote-session-scanner.test.ts` | pending upstream review |
| ORCAW-013 | Windows editor tab identity | upstream-candidate | 1.4.165-wyk.10 | Preserve active-file tabs across Windows path identity variants | `src/renderer/src/store/slices/editor-tab-file-identity.ts`, `src/renderer/src/store/slices/tabs.ts` | `src/renderer/src/store/slices/editor-tab-file-identity.test.ts`, `src/renderer/src/store/slices/tabs-model-reconciliation.test.ts` | pending upstream review |
| ORCAW-014 | Markdown editing and source outline | upstream-candidate | 1.4.165-wyk.11 | Preserve source editing, Markdown table of contents, and inline editing behavior | `src/renderer/src/components/editor/MarkdownSourceEditorSurface.tsx`, `src/renderer/src/components/editor/markdown-table-of-contents.ts`, `src/renderer/src/components/editor/rich-markdown-inline-input.ts` | `src/renderer/src/components/editor/EditorContent.monaco-lifecycle.test.tsx`, `src/renderer/src/components/editor/MarkdownTableOfContentsPanel.test.tsx`, `src/renderer/src/components/editor/rich-markdown-inline-input.test.ts` | pending upstream review |
| ORCAW-015 | Upstream sync and customization replay governance | active | 1.4.187-wyk.3 | Preserve stable-only upstream tracking, approved archived non-fast-forward tracking replacement, immutable upstream-base release validation, customization registration, exact replay coverage, and explicit retirement approval | `FORK_NOTES.md`, `AGENTS.md`, `.github/workflows/fork-upstream-sync.yml`, `.github/workflows/fork-desktop-packages.yml`, `config/scripts/fork-customization-registry.mjs`, `config/scripts/fork-customization-commit-coverage.mjs`, `config/scripts/fork-upstream-adoption.mjs`, `config/scripts/fork-release-contract.mjs` | `config/scripts/fork-customization-registry.test.mjs`, `config/scripts/fork-customization-commit-coverage.test.mjs`, `config/scripts/fork-upstream-adoption.test.mjs`, `config/scripts/fork-release-contract.test.mjs`, `config/scripts/fork-upstream-sync-workflow.test.mjs`, `config/scripts/fork-desktop-packages-workflow.test.mjs` | none |
| ORCAW-016 | Safe project removal and worktree deletion | active | 1.4.187-wyk.3 | Keep project removal non-destructive, retain permanent child-worktree deletion as a separate action, and always confirm context-menu deletion | `src/renderer/src/components/sidebar/WorktreeContextMenu.tsx`, `src/renderer/src/components/sidebar/delete-worktree-flow.ts`, `src/renderer/src/components/sidebar/worktree-context-menu-delete-intent.ts`, `src/renderer/src/components/sidebar/worktree-delete-request.ts`, `src/renderer/src/i18n/locales/zh.json` | `src/renderer/src/components/sidebar/WorktreeContextMenu.test.ts`, `src/renderer/src/components/sidebar/delete-worktree-flow.test.ts`, `src/renderer/src/components/sidebar/worktree-context-menu-delete-intent.test.ts` | none |

`upstream-candidate` entries remain in the replay set until behavioral equivalence is explicitly confirmed. Replace `unreleased` with the first published Orcaw version that contains ORCAW-015 or ORCAW-016.

## Fork upstream adoption

After `main` adopts an upstream version and before creating its release tag,
tag the reviewed stable upstream commit as `upstream-base/vX.Y.Z`. That tag is
immutable and remains the release base for all `vX.Y.Z-wyk.N` tags. Verify a
clean candidate without changing `main` or `upstream-sync`:

```bash
pnpm verify:fork-upstream-adoption -- vX.Y.Z HEAD
pnpm verify:fork-upstream-adoption -- vX.Y.Z HEAD --id ORCAW-015
```

The verifier checks the stable tag and package version, candidate ancestry,
clean working tree, registry, exact replay trailers, and absence of retained
release commits. It runs one deduplicated Vitest command for registry
verification code spans; `--id` narrows only that test set after validating the
whole replay.

## Fork desktop packages

For a temporary test build, run `Fork Desktop Packages` from the Actions tab
and optionally enter a branch, tag, or SHA. The workflow uploads Windows x64,
Linux x64/ARM64, and macOS x64/ARM64 installers for 14 days.

For a permanent GitHub Release, create and push a `v*` tag:

```bash
git tag v1.4.165-wyk.1
git push origin v1.4.165-wyk.1
```

The workflow publishes the Release only after every platform succeeds. A tag
such as `v1.4.165-wyk.1` records the upstream base, fork owner, and fork
revision. Keep the `package.json` version equal to the tag without its leading
`v`, increment the final revision for another fork build, and reset it to `1`
after adopting a new upstream version. Exact `vX.Y.Z-wyk.N` tags are normal
GitHub Releases; other hyphenated versions such as RC, beta, hourly, and adhoc
tags remain pre-releases. GitHub generates the release notes, and attached
installers remain available until the Release or assets are deleted. A failed
asset upload leaves an unpublished draft that can be retried.

Release assets use Orcaw names such as `orcaw-windows-setup.exe`,
`orcaw-linux.AppImage`, `orcaw-ide_<version>_amd64.deb`, and
`Orcaw-<version>-arm64-mac.zip`. The workflow verifies installers, blockmaps,
and updater manifests before publishing the draft.

Windows builds are unsigned, so SmartScreen can warn when opening them; use
Orcaw's update prompt to open the exact Release and install the matching
installer manually. macOS release builds are Developer ID-signed and notarized,
so ShipIt can install matching Orcaw updates automatically. Linux packages
retain the existing automatic update path.
