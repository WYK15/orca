# Orcaw Independent Desktop Identity Design

## Goal

Rename the downstream desktop product from Orca to Orcaw and give it a fully
independent operating-system identity. Official Orca and Orcaw must be
installable and runnable at the same time without sharing application state,
overwriting commands, or downloading each other's updates.

This is a persistent downstream customization. The implementation must stay
focused on product identity seams so later upstream integrations remain
practical.

## Scope

The rename covers:

- Desktop application names and identifiers.
- Packaged executable, installer, package, shortcut, and artifact names.
- Production and development user-data identities.
- Native helper identities where they derive authority from the desktop app.
- Installed CLI command names across native, Linux, WSL, SSH, and relay paths.
- Desktop update and GitHub Release asset contracts.
- User-facing application-shell names that derive from the runtime product
  identity.

The following remain unchanged:

- TypeScript module names and existing internal `orca` domain terminology.
- `ORCA_*` environment variables and IPC/event constants.
- Mobile application branding.
- The `orca://` mobile pairing format.
- Historical issue links, upstream repository references, and attribution that
  intentionally identify the upstream Orca project.
- Existing user data. Orcaw does not import, move, or delete an Orca profile.

## Product Identity

The desktop identity is:

| Role | Orcaw value |
| --- | --- |
| Product name | `Orcaw` |
| Application ID | `com.wyk15.orcaw` |
| Development application name | `Orcaw Dev` |
| Development application ID prefix | `com.wyk15.orcaw.dev` |
| macOS application | `Orcaw.app` |
| Windows executable | `Orcaw.exe` |
| Linux executable and package | `orcaw-ide` |
| Native CLI command | `orcaw` |
| Linux and WSL CLI command | `orcaw-ide` |
| GitHub update repository | `WYK15/orca` |

The packaged application name gives Orcaw a separate default user-data
directory. Startup must resolve and capture the Orcaw path before exposing it
through the existing `ORCA_USER_DATA_PATH` compatibility variable. The
single-instance lock, runtime pointer, secure storage name, caches, logs, and
managed hooks therefore remain scoped to Orcaw.

Development keeps its existing isolation behavior but uses an Orcaw-specific
development profile. E2E and explicit profile overrides continue to take
precedence.

## Canonical Branding Configuration

Add `config/orcaw-product-identity.json` as the canonical source for stable
fork identity values. It contains product name, application IDs, helper
identity, CLI names, repository identity, and artifact prefixes.

Electron Builder configuration, runtime identity code, native build scripts,
release-contract scripts, and focused tests consume this configuration where
their toolchain permits. Generated or compiled code may project the values into
its own format, but it must not establish another independent authority.

Platform-specific behavior stays in its existing platform modules. The
branding configuration supplies values; it does not become a generic runtime
utility or absorb packaging logic.

## Platform Packaging

### macOS

Electron Builder emits `Orcaw.app` with bundle ID `com.wyk15.orcaw`. DMG and ZIP
artifacts use the `orcaw-macos-<arch>` prefix.

The Computer Use helper receives a distinct Orcaw helper bundle ID and accepts
the Orcaw desktop bundle as its authenticated owner. Its packaged path and
display name use `Orcaw Computer Use.app` so macOS privacy controls do not
conflate it with an official Orca helper.

The notification helper remains an internal executable, but every bundle or
responsible-application check uses the Orcaw identity. Existing signing and
notarization rules continue to apply to release and local builds.

### Windows

Electron Builder emits `Orcaw.exe`. NSIS uses the Orcaw product name for the
install directory, shortcut, uninstall entry, and display name. The installer
artifact is `orcaw-windows-setup.exe`.

The packaged CLI launcher installs only `orcaw`. It never deletes, replaces, or
claims ownership of an existing `orca` command.

### Linux

The application executable, Debian package, desktop file, and bundled CLI use
`orcaw-ide`. AppImage and Debian artifacts use an `orcaw` prefix. Desktop
metadata and `StartupWMClass` must agree with the renamed executable so docks
group the window correctly.

Orcaw does not install a bare `orca` dispatcher. Managed terminal environments
receive only the Orcaw command names.

## CLI, WSL, SSH, and Relay

CLI command selection becomes product-aware while preserving the existing
platform rules:

- macOS and Windows use `orcaw`.
- Linux and WSL use `orcaw-ide`.
- SSH and relay installations use the command bundled by Orcaw for the remote
  target rather than assuming an official Orca command is present.

Installer ownership and cleanup are name-scoped. Orcaw may repair or remove
only launchers carrying Orcaw provenance. Legacy Orca launchers and unmanaged
commands are left untouched.

User-facing help and orchestration preambles show the installed Orcaw command.
Internal environment variables remain `ORCA_*` to avoid a broad protocol
migration with no coexistence benefit.

## Mobile Pairing Compatibility

The mobile pairing payload stays `orca://pair?...`. This scheme is data
accepted by the existing mobile client and desktop/web pairing parsers; it is
not used as the desktop application's operating-system identity.

Orcaw continues to generate and accept the current pairing format. Mobile
branding and deep-link registration are outside this change.

## Releases and Updates

The fork release workflow continues to trigger from the existing
`v<upstream-version>-wyk.<revision>` tags. It publishes Orcaw-named assets and
matching updater metadata to `WYK15/orca`.

Every desktop update URL is derived from the fork repository identity. Orcaw
must not fall back to `stablyai/orca` when feed resolution, metadata validation,
or asset download fails. A failure remains an ordinary update error and leaves
the installed application unchanged.

Windows and Linux use the existing in-app updater flow against the fork
Release. Update selection continues to understand the fork prerelease version
format.

The current personal macOS packages are unsigned. Electron Builder documents
that macOS code signing is required for automatic updates, so unsigned Orcaw
builds only detect a newer fork release and open its Release page for manual
download. Automatic macOS download and installation may be enabled later when
the fork's release pipeline has a valid Apple signing identity. The macOS
package must continue to include both DMG and ZIP assets so it is ready for that
transition.

Release validation fails before publication if required Orcaw assets or updater
metadata use stale Orca filenames. A partially successful multi-platform build
remains an unpublished draft under the existing fork release policy.

## Existing Installations

Installing Orcaw does not migrate an existing official or fork-built Orca
profile. Orcaw starts with a clean profile, and both applications retain their
own settings, tabs, credentials, caches, runtime endpoints, and secure-storage
entries.

No installer or startup path deletes Orca files. A user may uninstall either
application without removing the other's application bundle, state, CLI
launchers, or helpers.

## Failure Behavior

- Missing or invalid branding configuration fails the build or packaging
  contract rather than silently using Orca defaults.
- A detected Orca executable, CLI, profile, or helper is treated as
  independently owned and is never adopted or cleaned up by Orcaw.
- Update metadata pointing outside `WYK15/orca` is rejected without fallback.
- Unsupported automatic updates on unsigned macOS builds surface the manual
  Release action instead of attempting an installation that cannot succeed.
- Existing E2E user-data overrides and disposable-home safeguards retain
  precedence over the default Orcaw paths.

## Testing

Focused tests cover:

- The canonical product name, application IDs, helper IDs, and update
  repository.
- Electron Builder output for macOS, Windows, and Linux, including artifact and
  executable names.
- Production and development application identity and user-data isolation.
- Native, Linux, WSL, SSH, and relay CLI command selection.
- Installer cleanup refusing to touch Orca command names.
- Computer Use owner validation and helper path resolution.
- Fork update URLs, prerelease selection, manual unsigned-macOS behavior, and
  rejection of official feed fallback.
- Release workflow required-asset contracts using Orcaw filenames.

Verification uses these focused suites plus affected TypeScript and changed-code
quality checks. Unrelated slow suites are not required unless a focused failure
shows a broader regression.

## Fork Documentation

`FORK_NOTES.md` records Orcaw identity isolation as a persistent customization
and updates the example Release asset names and installation guidance. The note
must make clear that upstream syncs must not restore official product IDs,
command names, or update feeds.
