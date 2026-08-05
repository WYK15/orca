# AI Vault Session Deletion Design

## Goal

Let users retire completed local agent sessions from Agent Session History by
removing the provider-owned session data after explicit confirmation. Adopt the
reviewed implementation from
[stablyai/orca#10249](https://github.com/stablyai/orca/pull/10249) without
expanding deletion to providers whose storage cannot be updated completely and
safely.

This is a focused upstream backport. Preserve the pull request's provenance and
keep it separate from Orcaw-specific product customizations.

## User Experience

The row dropdown and context menu expose a destructive Delete action. Selecting
it opens a confirmation dialog naming the session and explaining that the
provider will no longer be able to resume it.

Delete is enabled only for a finished, local session whose provider has a
complete removal plan. It remains visible but disabled when:

- The session is still running.
- The session belongs to an SSH or other remote execution host.
- The session uses a synthetic path.
- The provider's storage cannot be removed consistently.

The disabled item provides an accessible reason through its tooltip and
`aria-label`. Choosing a menu action must not expand the session row behind the
dialog.

The UI reuses the existing shadcn menu and alert-dialog primitives, destructive
style roles, spacing, and typography documented in `docs/STYLEGUIDE.md`.

## Supported Providers

The first version supports complete removal for 12 providers:

- Single-file sessions: Gemini, Copilot, Cursor, Hermes, Devin, OpenClaw,
  Droid, Pi, and OMP.
- Directory-shaped sessions: Claude, Rovo, and Grok.

The initial release excluded Antigravity, Kimi, Codex, and OpenCode:

- Antigravity and Kimi retain external registry state that cannot be updated
  reliably from the discovered session path.
- Codex can retain hard-linked aliases and multiple indexes, causing a removed
  session to reappear; the extension below adds the required complete plan.
- Current OpenCode sessions are rows in a shared SQLite database rather than
  independent files.

Unsupported providers must never fall back to deleting only the discovered
`filePath`.

## Codex Extension

Codex becomes deletable for local native-home sessions. A Codex removal is
identified by the transcript's parsed session id, not by its rollout filename.
The main process derives every known local Codex home that can represent that
session: the configured history source, the default `~/.codex` home when it is
scanned, and Orca's managed runtime home. It removes only transcript files that
parse to the selected id and are beneath those homes' `sessions` directories.

Each affected home's `session_index.jsonl` is rewritten atomically with records
for that id removed. Missing transcript aliases and missing index files are
allowed. A hardlinked alias is removed once from the filesystem; independently
copied aliases are both removed. A session is reported deleted only after all
index rewrites and transcript removals succeed. On failure, caches remain intact
and the row stays available for retry.

SSH and runtime-host sessions remain rejected. WSL Codex deletion remains
rejected until the index rewrite can be performed atomically inside the distro;
the existing generic WSL file-delete path is not sufficient because it cannot
maintain `session_index.jsonl`.

Antigravity, Kimi, and OpenCode remain unsupported. Antigravity has no stable
registry identity, Kimi needs its own index-aware plan, and OpenCode 1.17+
stores sessions as SQLite rows.

## Removal Semantics

Removal is reversible where the platform permits it. Native local targets are
moved to the operating system trash through Electron's `shell.trashItem`.
Missing targets are treated as an idempotent success.

WSL UNC paths have no usable recycle bin and use the existing WSL deletion
path. The confirmation copy must not promise that every deletion is
recoverable.

Directory-shaped sessions use provider-specific removal plans:

- Claude removes the transcript, its session directory, and its
  `session-env/<uuid>` companion. It preserves `file-history/<uuid>` because
  that directory can contain the only rewind copy of user files.
- Rovo and Grok remove the complete session directory rather than only the
  metadata or summary file exposed by the scanner.

Companion targets are removed before the primary transcript. If a partial
failure occurs, the transcript remains discoverable so the user can retry.

## Trust Boundary

The renderer decides only whether to offer the action. It is not a security
boundary.

The main process treats the IPC payload as untrusted and re-derives the
provider-specific removal plan. Before deleting, it verifies:

- The execution host is local.
- The provider is explicitly supported.
- The supplied path is not synthetic.
- The resolved path is inside a known session root for that provider.
- The path matches the same discovery predicate used by the scanner.
- Every target has the expected file or directory kind.
- Real paths remain inside real session roots, including symlinked roots.
- A directory plan cannot resolve to a provider's shared sessions root.

Path construction uses Node path utilities. No path is interpolated into a
shell command. SSH and runtime-host deletion are outside this version.

## Cache Consistency

After a successful deletion, invalidate:

- The shared cached session list.
- The desktop multi-host cache.
- The persisted path-keyed parse cache entry.
- Every Codex index-title cache entry for a rewritten Codex home.

List caches use a generation guard so a scan started before deletion cannot
write its stale result after deletion and temporarily resurrect the row.
Renderer refresh provides immediate feedback but is not the consistency
mechanism.

## Integration Strategy

Merge the reviewed `5hseok/feat/ai-vault-session-delete` branch into
`custom/main` with an explicit merge commit. Do not squash or rewrite the
contributor's commits. The common base is upstream commit
`95c431f5c356d7545aec7f422c43514831b46ebf`, and a merge-tree check against the
current Orcaw head reports no conflicts.

The merge remains local until the user explicitly requests a push.

Add PR #10249 to the backported-upstream section of `FORK_NOTES.md`. Remove the
entry after a later upstream synchronization contains the equivalent change.

## Failure Behavior

- Validation rejection leaves all provider data untouched and returns a
  user-facing unavailable result.
- A filesystem or IPC failure leaves the row available when possible and shows
  a generic failure notification.
- The confirmation dialog cannot be dismissed while deletion is in flight.
- No unsupported provider is partially deleted.
- No remote deletion is attempted.
- Existing parse and list caches cannot report success while continuing to
  serve a pre-delete result.
- Codex index replacement uses a same-directory temporary file and rename; a
  failed write or rename leaves the transcript row available for retry.

## Verification

Keep verification focused on the affected feature:

- Session target validation and provider removal-plan tests.
- Filesystem executor ordering, idempotency, type, realpath, symlink, and WSL
  tests.
- IPC wiring and cache-generation race tests.
- Renderer deletability, reason text, confirmation flow, and menu event tests.
- The isolated-home AI Vault deletion E2E test when its local prerequisites are
  available.
- Codex dual-root hardlink/copy, index rewrite, custom-home, missing-index,
  failure, cache invalidation, and WSL-rejection tests.
- Affected TypeScript type checking and changed-code lint checks.

Do not run unrelated slow suites unless a focused failure indicates a broader
regression.
