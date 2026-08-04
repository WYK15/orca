# Fork Notes

## Backported upstream changes

- [stablyai/orca#12050](https://github.com/stablyai/orca/pull/12050) — Windows persisted PATH ordering.
- [stablyai/orca#12048](https://github.com/stablyai/orca/pull/12048) — resizable responsive Markdown tables.
- [stablyai/orca#11985](https://github.com/stablyai/orca/pull/11985) — Markdown table structure controls.

Remove an entry after an upstream sync contains its equivalent commits.

## Persistent customizations

- Desktop workspace tabs shrink evenly to a 72px minimum before horizontal
  overflow, instead of upstream's 88px minimum.
- Rich Markdown's toolbar provides a 10×10 table-size grid and a validated
  custom-size dialog; selected rows are body rows and insertion adds a header.

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
after adopting a new upstream version. Fork tags are pre-releases. GitHub
generates the release notes, and attached installers remain available until the
Release or assets are deleted. A failed asset upload leaves an unpublished
draft that can be retried.

These personal Windows and macOS builds are unsigned, so SmartScreen or
Gatekeeper can warn when opening them. Publishing a Release does not change
the application's official Orca update feed.
