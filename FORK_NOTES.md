# Fork Notes

## Backported upstream changes

- [stablyai/orca#12050](https://github.com/stablyai/orca/pull/12050) — Windows persisted PATH ordering.
- [stablyai/orca#12048](https://github.com/stablyai/orca/pull/12048) — resizable responsive Markdown tables.
- [stablyai/orca#11985](https://github.com/stablyai/orca/pull/11985) — Markdown table structure controls.

Remove an entry after an upstream sync contains its equivalent commits.

## Fork desktop packages

Run `Fork Desktop Packages` from the Actions tab and optionally enter a branch,
tag, or SHA. The workflow uploads Windows x64, Linux x64/ARM64, and macOS
x64/ARM64 installers to the workflow run for 14 days.

These personal Windows and macOS builds are unsigned, so SmartScreen or
Gatekeeper can warn when opening them. The workflow does not create a GitHub
Release, and the application continues to use the official Orca update feed.
