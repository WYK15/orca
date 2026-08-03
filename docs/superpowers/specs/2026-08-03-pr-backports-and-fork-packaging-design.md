# Upstream PR Backports and Fork Packaging

## Goal

Integrate upstream PRs [#12050](https://github.com/stablyai/orca/pull/12050),
[#12048](https://github.com/stablyai/orca/pull/12048), and
[#11985](https://github.com/stablyai/orca/pull/11985) into the fork while
preserving their history, then add a fork-safe GitHub Actions workflow that
produces installable desktop artifacts for Windows, Linux, and macOS.

## Branch Model

Use `docs/fork-maintenance-guidance` as the common base. Preserve each upstream
change on a focused branch:

- `backport/pr-12050-windows-path-ordering`
- `backport/pr-12048-markdown-table-resize`
- `backport/pr-11985-markdown-table-actions`

Create `custom/main` from the common base and merge those branches in the order
shown above. The Windows fix is independent. The table resize branch precedes
the table action branch so the aggregate history introduces the table's
presentation behavior before its structure controls.

Cherry-pick the original upstream commits without squashing:

- #12050: `84847590314af37b1274fa34599e07245730fd07`
- #12048: `2c7610464`, `efc526a3c`, `9ba3468a6`
- #11985: `69c6644fc`, `b35b231c5`

## Backport Verification

Run the focused Vitest files introduced or modified by each PR on its isolated
branch. On `custom/main`, run the combined focused suite, `pnpm typecheck`, and
`pnpm build:desktop`.

The existing full-suite baseline is 44,107 passed, 15 failed, and 81 skipped.
The known failures must remain separate from regressions introduced by these
backports. In particular, the macOS root-directory guard currently invokes
Bash associative arrays unavailable in the system Bash 3.2, and the updater
test has an existing expected-message mismatch.

The editor changes must continue to follow `docs/STYLEGUIDE.md`, use the tokens
from `src/renderer/src/assets/main.css`, and reuse existing shadcn primitives.

## Fork Packaging Workflow

Add `.github/workflows/fork-desktop-packages.yml` with a manual
`workflow_dispatch` input for the branch, tag, or SHA to build. Use a four-entry
matrix:

- `windows-2022`, x64
- `ubuntu-24.04`, x64
- `ubuntu-24.04-arm`, arm64
- `macos-15-intel`, x64 and arm64

These labels are standard GitHub-hosted runners documented in the
[GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Each matrix job checks out the requested ref, installs the repository's pinned
pnpm and Node versions, restores Electron Builder caches, installs dependencies
with the existing retry pattern, and runs `pnpm build:release`. Linux jobs
install the native desktop dependencies already used by the official release
workflow.

Packaging uses Electron Builder directly for the selected platform and
architecture:

- Windows: NSIS installer
- Linux: AppImage, deb, and rpm
- macOS: x64 and arm64 dmg and zip artifacts from one configured target set

Every Electron Builder invocation includes `--publish never`. The workflow
uploads its outputs with `actions/upload-artifact`; it never publishes through
the repository's Electron Builder `publish` configuration, which points to
`stablyai/orca`.

## Security and Release Boundaries

The fork workflow has read-only repository permissions and does not consume
Apple, SignPath, telemetry, diagnostics, or upstream release credentials.
Windows and macOS outputs are therefore unsigned. The workflow and fork notes
must state that Windows SmartScreen and macOS Gatekeeper can warn when users
open these personal builds.

This phase does not create GitHub Releases and does not change the application's
update feed. A fork-specific updater requires separate design because the
current updater intentionally follows official Orca releases.

## Persistent Fork Notes

Create `FORK_NOTES.md` when the packaging workflow lands. Record the three
backported PRs, the fork-only packaging workflow, the unsigned artifact
limitation, and the unchanged official update feed. Remove individual PR
entries after the equivalent upstream changes arrive through a later sync.

## Failure Behavior

- Matrix jobs are independent and use `fail-fast: false`, so one platform does
  not hide results from the others.
- Missing package outputs fail the upload step with `if-no-files-found: error`.
- Packaging never retries by publishing; all retries remain local builds with
  `--publish never`.
- The workflow does not silently fall back to official release credentials or
  official telemetry identity.
