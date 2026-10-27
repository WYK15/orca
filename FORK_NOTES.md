# Fork Notes

## Backported upstream changes

- [stablyai/orca#12050](https://github.com/stablyai/orca/pull/12050) — Windows persisted PATH ordering.
- [stablyai/orca#12048](https://github.com/stablyai/orca/pull/12048) — resizable responsive Markdown tables.
- [stablyai/orca#11985](https://github.com/stablyai/orca/pull/11985) — Markdown table structure controls.
- [stablyai/orca#10249](https://github.com/stablyai/orca/pull/10249) — safe
  deletion of supported local Agent Session History entries.

Remove an entry after an upstream sync contains its equivalent commits.

## Persistent customizations

- The personal Tauri build omits scheduled automations, Orca plugin management
  and its worker, Linear/Jira, simulator entry points, and first-use tours.
  It also excludes SSH hosts, paired Orca servers, Orca orchestration,
  experimental features, the workspace board, and the floating workspace.
  Floating workspace controls, settings, and shortcuts are unavailable even
  with legacy enablement; stored files, drafts, and terminal records remain intact.
  The shortcut configuration file opens with the default external application.
  Remote connection IPC and
  orchestration RPC are unavailable; packages omit SSH relay payloads. Effective
  settings ignore legacy remote selection and experimental enablement while
  retaining their stored records. Local folder and Git workspaces remain usable.
  Codex's own plugins remain managed by Codex. Legacy settings stay readable.
  Sidebar projects support pinning, archiving, searchable bulk restore, and undo.
  Archiving is a display preference keyed by source repo identity across project
  host setups; it preserves files, workspace state, and running terminals.
  Appearance settings persist independent icon size, sidebar/explorer text size,
  and list spacing. These preferences also survive profile import ID remapping.
  Workspace context menus omit status assignment, read/unread toggles, and sleep.

- The `refactor/tauri-desktop` branch adds a Mac ARM64 Tauri shell and
  standalone Node backend beside the Electron desktop. It uses isolated
  `com.wyk15.orcaw.tauri` data and reuses the existing renderer/preload contract.
  Persistent terminals use the existing daemon under bundled Node; native
  text/image/file clipboard operations use Rust with workspace authorization.
  The Tauri host keeps its credential key in the OS vault, uses authenticated
  encryption for existing storage callers, and reuses the translated application
  menu. Tauri checks and releases remain manual during the migration.
  Tauri tags use `vX.Y.Z-wyk.N-tauri.N`, are excluded from Electron
  release builds, and publish signed/notarized Mac ARM64 ZIP and DMG assets
  without replacing the Electron Latest release. The release channel defaults
  to preview; an explicit stable channel publishes a normal GitHub Release.
  Tauri can import the active Orcaw profile once, with native confirmation and
  a local backup. Project IDs are remapped when deduplicating existing projects;
  SSH/folder ownership and Tauri drafts are preserved. The applications retain
  separate data, credentials and live-terminal identities.
  Migration status and limitations are recorded in `src-tauri/README.md`.
  The migration currently targets macOS ARM64 only. Embedded browser panes
  and browser automation are disabled in Tauri; links open in Chrome with a
  system-browser fallback. Native macOS notifications reuse existing notification
  preferences and terminal navigation. Electron platform support and remote
  SSH relay targets remain unchanged.

- Markdown review notes are removed from preview, rich editing, and source
  editing, including note controls, review rails, shortcuts, and the settings
  toggle. Stored notes remain intact for compatibility; saved enablement
  preferences cannot restore the feature. Diff review comments remain available.
- Desktop workspace tabs shrink evenly to a 72px minimum before horizontal
  overflow, instead of upstream's 88px minimum.
- Rich Markdown's toolbar provides a 10×10 table-size grid and a validated
  custom-size dialog; selected rows are body rows and insertion adds a header.
- Rich Markdown renders and source-edits a bounded allowlist of safe inline
  HTML plus `<p>` and `<h1>`–`<h6>` blocks; unsupported HTML remains lossless
  raw source.
- Desktop builds ship as Orcaw with the independent `com.wyk15.orcaw`
  application identity, isolated user data, `orcaw` / `orcaw-ide` commands,
  and updates sourced only from `WYK15/orca`. Preserve these seams during
  upstream synchronization. Unsigned macOS and Windows builds open the matching
  Release for manual installation. The `1.4.165` maintenance line sets
  `orcawAutomaticUpdates: false` in package metadata: no startup, timed,
  wake/focus, or nudge checks, automatic downloads, or quit-time installs on
  any platform. Manual checks remain available and open the matching Release
  for manual installation, including Linux and signed macOS builds.
- Inherited cron schedules are disabled in this fork. Tag pushes still build
  and publish desktop releases; manual, pull-request, and release event
  triggers remain available where their workflows define them.

## Markdown source preservation

The personal Tauri build uses a source-first CodeMirror 6 editor for Markdown.
Live, source and reading views share document state and undo history. Visual
edits patch source ranges, including table cells; untouched source and mixed
line endings remain intact. Image imports use the file owner's existing
local/SSH/runtime authorization. Local Markdown can also reference images outside
the workspace through an image-only reader tied to an authorized Markdown file.
This reader checks image content and size and grants no general filesystem access;
remote documents keep their owning host route. The Electron editor and source recovery path
remain available. Writing preferences persist separately in local WebView storage;
self-contained HTML and native print/PDF export read complete source snapshots.
See [the editor design and validation notes](docs/readme/markdown-live-editor.md).

The legacy rich editor rejects saves when it cannot preserve the original Markdown source
formatting. It opens the edited draft in source mode and pauses all saves until
the user accepts the formatting changes or restores the previous source.
The draft, recovery source, and save pause survive workspace session restore.

## Fork desktop packages

For a temporary test build, run `Fork Desktop Packages` from the Actions tab
and optionally enter a branch, tag, or SHA. The workflow uploads Windows x64,
Windows ARM64, Linux x64/ARM64, and macOS ARM64 installers for 14 days.
Fork macOS releases build on Apple Silicon and omit Intel DMG/ZIP packages.

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
`orcaw-windows-arm64-setup.exe`,
`orcaw-linux.AppImage`, `orcaw-ide_<version>_amd64.deb`, and
`Orcaw-<version>-arm64-mac.zip`. The workflow verifies installers, blockmaps,
and updater manifests before publishing the draft.

The Windows ARM64 package uses ARM64 Electron and node-pty binaries. Its
bundled x64 browser helper runs through Windows 11 emulation.

Windows builds are unsigned and can trigger SmartScreen; macOS releases use
Developer ID signing and Apple notarization. Maintenance builds do not check
for or install updates automatically. Use a manual check to open the exact
Release, download the matching installer, and install it manually.

Desktop installers bundle a pinned ripgrep executable for their target OS and
architecture. Local content search and file listing use it without requiring
`rg` in the user's PATH. WSL and SSH searches execute on their respective hosts
and retain the remote `rg` / Git fallback; desktop binaries are not run remotely.

Maintenance packages omit voice dictation (including cloud transcription and
local ONNX libraries), the browser/mobile web client, and welcome GIFs. Voice
and mobile entries are hidden even with legacy settings enabled; welcome
previews use static posters. Existing speech models and credentials are left
in user data. SSH workspaces remain supported through the separately bundled
relay, which is excluded from app.asar to avoid a second copy. The simulator
uses the single serve-sim package in Resources/node_modules.
Desktop main, preload, and renderer builds enable JavaScript minification.
