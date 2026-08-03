# Tag-Triggered Desktop Release Design

## Goal

Publish permanent GitHub Release assets from the existing cross-platform
desktop packaging workflow whenever a `v*` version tag is pushed.

## Trigger Behavior

- Keep `workflow_dispatch` for branch, tag, or SHA test builds.
- Add a `push.tags` trigger matching `v*`.
- Manual runs upload 14-day Actions artifacts and never create a Release.
- Tag runs build the exact tagged commit and publish a Release only after every
  packaging job succeeds.

Examples:

- `v1.4.166` creates a stable Release.
- `v1.4.166-rc.1` creates a pre-release.
- Tags that do not start with `v` do not trigger this workflow.

## Build and Publish Flow

The existing package matrix remains responsible for Windows x64, Linux x64,
Linux ARM64, and configured macOS x64/ARM64 targets. Each matrix job uploads
its packages as a short-lived Actions artifact for both manual and tag runs.

A separate Ubuntu `release` job depends on the complete package matrix. On tag
runs it downloads every package artifact from the current workflow run into a
single staging directory. Because the release job runs only after the complete
matrix succeeds, a platform build failure cannot publish an incomplete Release.

The release job creates a draft for the pushed tag, attaches all staged package
files, and enables GitHub-generated release notes. It publishes the draft only
after every asset upload succeeds. If asset upload fails, the draft remains
unpublished for inspection or retry.

## Release Metadata

- The pushed tag is both the Release tag and title.
- Tags containing `-` are pre-releases; tags without `-` are stable releases.
- GitHub generates release notes from changes since the previous tag.
- GitHub determines whether a stable Release is the latest release.
- Published Release assets remain available until the Release or its assets are
  explicitly deleted.

## Permissions and Safety

The workflow keeps `contents: read` as its default permission. Only the release
job receives `contents: write`, using the run-scoped `GITHUB_TOKEN`.

Package commands retain `--publish never`; Electron Builder never publishes
independently. This keeps release creation centralized and prevents concurrent
matrix jobs from racing to mutate the same Release.

Windows and macOS packages remain unsigned. This workflow does not change the
application's official Orca update feed or require signing secrets.

## Failure and Retry Behavior

- A failed package job prevents the release job from running.
- A failed asset upload leaves a draft rather than a public partial Release.
- Re-running a failed tag workflow must handle an existing draft for the same
  tag by reusing it and replacing same-named assets.
- Re-pushing or moving a published version tag is outside the supported release
  flow; fixes use a new version tag.

## Verification and Documentation

Extend the workflow structure test to verify:

- both manual and `v*` tag triggers;
- default read-only permissions and release-job write permission;
- release dependency on the complete package matrix;
- tag-only release execution;
- current-run artifact download;
- draft-first publication;
- generated notes and hyphen-based pre-release detection;
- Electron Builder remains configured with `--publish never`.

Update `FORK_NOTES.md` with the tag command, stable/pre-release examples,
permanent Release asset behavior, failure semantics, and the unsigned-package
warning.
