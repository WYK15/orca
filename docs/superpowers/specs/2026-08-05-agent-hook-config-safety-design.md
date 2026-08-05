# Agent Hook Config Safety

## Goal

Prevent Orca from creating agent configuration directories or files unless the agent was positively detected and an install was requested. Removing managed hooks from a missing configuration must be a true no-op.

## Scope

- Fail closed in the relay, SSH, and WSL aggregate installer when the detected-agent allowlist is omitted or empty.
- Avoid home, shell, identity, lock, and installer work when no remote agent is allowlisted.
- Make affected local hook removers preserve a missing configuration file and its missing parent directories.
- Preserve existing user configuration while removing only Orca-managed hook entries.
- Cover Linux, macOS, Windows, SSH hosts, WSL guests, and folder workspaces.

Historical empty files or directories are not deleted automatically.

## Design

### Remote installation

`installManagedHooks` normalizes a missing allowlist to an empty list and returns an empty summary before resolving homes or acquiring the install lock. `installRemoteManagedAgentHooks` independently treats a missing or empty allowlist as permission to install nothing. Intentional full-install test fixtures must pass the explicit registered-agent list.

The two checks protect both the relay entry point and direct callers. A caller bug cannot silently widen an empty selection into every supported agent.

### Local removal

Each affected hook service reads a snapshot that distinguishes a missing file from an existing empty object. When the snapshot reports no original file, `remove()` returns the service's normal `not_installed` status without writing.

Existing valid files continue through the current managed-entry removal logic. Existing malformed files retain current error behavior. No generic JSON writer behavior changes.

### Data safety

Installation remains restricted to positively detected, enabled agents. Removal never creates configuration state and never removes unrelated keys or hooks. The fix does not recursively delete directories or attempt to infer whether an existing empty file belongs to Orca.

## Tests

Tests follow red-green-refactor:

- An omitted or empty remote allowlist produces no files or directories.
- An empty relay allowlist performs no home, shell, identity, lock, or installer probes.
- Every affected local remover leaves a nonexistent config path and parent directory nonexistent.
- Removal from an existing config preserves unrelated user fields and removes only Orca-managed entries.
- Existing aggregate reconciliation tests continue to cover disabled agents and the global hooks switch.

Focused Vitest suites run first, followed by relevant type-check, lint, and broader hook-service tests.

## Upstream Maintenance

Keep the remote changes aligned with upstream PR #11676. Keep the local remover fix separate and narrowly scoped so it can be upstreamed or dropped independently after upstream adopts an equivalent fix. This is a routine safety fix and does not require `FORK_NOTES.md`.
