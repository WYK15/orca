# Stable Fork Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `v1.4.165-wyk.5` as a normal GitHub Release with complete desktop assets and working update discovery.

**Architecture:** A deterministic Node script classifies tag publication type and the GitHub Actions workflow consumes its output. Package metadata and the tag share one exact version.

**Tech Stack:** Node.js ESM, Vitest, GitHub Actions YAML, pnpm, Electron Builder

## Global Constraints

- Preserve the `vX.Y.Z-wyk.N` fork naming scheme.
- Treat exact fork tags as normal GitHub Releases.
- Keep other hyphenated SemVer tags as pre-releases.
- Preserve unsigned macOS/Windows manual installation and Linux automatic updates.
- Do not include the user-owned `tests/test.md`.

---

### Task 1: Release publication classification

**Files:**
- Create: `config/scripts/release-publication-kind.mjs`
- Create: `config/scripts/release-publication-kind.test.mjs`
- Modify: `.github/workflows/fork-desktop-packages.yml`
- Modify: `config/scripts/fork-desktop-packages-workflow.test.mjs`

**Interfaces:**
- Produces: `getReleasePublicationKind(tag): 'release' | 'prerelease'`
- Consumes: CLI output `release` or `prerelease`

- [ ] Write tests asserting fork and plain tags return `release`, other hyphenated versions return `prerelease`, and malformed tags throw.
- [ ] Run the focused tests and confirm they fail because the classifier does not exist.
- [ ] Implement the classifier and use its CLI output in the Release creation step.
- [ ] Run both classifier and workflow contract tests and confirm they pass.
- [ ] Commit the release-classification change.

### Task 2: Version and fork documentation

**Files:**
- Modify: `package.json`
- Modify: `FORK_NOTES.md`

**Interfaces:**
- Produces: package version `1.4.165-wyk.5`
- Consumes: tag `v1.4.165-wyk.5`

- [ ] Set the package version to `1.4.165-wyk.5`.
- [ ] Document that `wyk.N` tags are normal GitHub Releases while other prerelease suffixes remain pre-releases.
- [ ] Run package, updater, localization, and type validations.
- [ ] Commit the version and documentation.

### Task 3: Publish and monitor

**Files:**
- No source files.

**Interfaces:**
- Consumes: branch `custom/main`, tag `v1.4.165-wyk.5`
- Produces: published GitHub Release with required assets

- [ ] Push `custom/main`.
- [ ] Create annotated tag `v1.4.165-wyk.5` at the verified commit.
- [ ] Push the tag.
- [ ] Monitor the tag-triggered workflow until it reaches a terminal state.
- [ ] Verify the GitHub Release is published, is not a pre-release, and contains all required assets.
