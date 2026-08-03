# Tag-Triggered Desktop Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish permanent GitHub Release assets after all desktop packages build successfully for a pushed `v*` tag.

**Architecture:** Extend the existing `Fork Desktop Packages` workflow with a tag trigger and one Ubuntu release-aggregation job. Matrix jobs continue to publish short-lived Actions artifacts; the release job downloads those artifacts, creates or reuses a draft, uploads every package with replacement semantics, and publishes only after upload succeeds.

**Tech Stack:** GitHub Actions YAML, GitHub CLI, Vitest, Node.js YAML parser

## Global Constraints

- Keep `workflow_dispatch` for branch, tag, or SHA test builds.
- Manual runs upload 14-day Actions artifacts and never create a Release.
- Tag runs build the exact tagged commit and publish a Release only after every packaging job succeeds.
- Tags containing `-` are pre-releases; tags without `-` are stable releases.
- The workflow keeps `contents: read` by default; only the release job receives `contents: write`.
- Electron Builder invocations retain `--publish never`.
- Windows and macOS packages remain unsigned.
- The application continues to use the official Orca update feed.
- All repository scripts and commands must remain compatible with macOS, Linux, and Windows unless a step is explicitly runner-scoped.

---

### Task 1: Tag Trigger and Release Aggregation

**Files:**
- Modify: `config/scripts/fork-desktop-packages-workflow.test.mjs`
- Modify: `.github/workflows/fork-desktop-packages.yml`

**Interfaces:**
- Consumes: Package artifacts named `orca-${platform}-${run_number}-${short_sha}` by the existing matrix.
- Produces: A tag-only `release` job that publishes every current-run package as GitHub Release assets.

- [ ] **Step 1: Write failing workflow structure tests**

Add tests that assert the tag trigger, least-privilege permissions, matrix
dependency, tag-only condition, current-run artifact aggregation, draft-first
creation, generated notes, pre-release detection, clobber upload, and final
publication:

```js
it('triggers release packaging for v-prefixed tags', () => {
  const workflow = parse(readFileSync(workflowPath, 'utf8'))

  expect(workflow.on.push.tags).toEqual(['v*'])
  expect(workflow.on.workflow_dispatch).toBeTruthy()
})

it('publishes complete tag builds through one least-privilege release job', () => {
  const workflow = parse(readFileSync(workflowPath, 'utf8'))
  const release = workflow.jobs.release
  const source = readFileSync(workflowPath, 'utf8')
  const download = release.steps.find(
    (step) => step.name === 'Download desktop packages'
  )

  expect(workflow.permissions).toEqual({ contents: 'read' })
  expect(release.needs).toBe('package')
  expect(release.if).toContain("github.event_name == 'push'")
  expect(release.if).toContain("startsWith(github.ref, 'refs/tags/v')")
  expect(release.permissions).toEqual({ contents: 'write' })
  expect(download.uses).toBe('actions/download-artifact@v8')
  expect(download.with.pattern).toContain('${{ github.run_number }}')
  expect(download.with['merge-multiple']).toBe(true)
  expect(source).toContain('gh release create \"$TAG_NAME\"')
  expect(source).toContain('--draft')
  expect(source).toContain('--generate-notes')
  expect(source).toContain('[[ \"$TAG_NAME\" == *-* ]]')
  expect(source).toContain('--prerelease')
  expect(source).toContain('gh release upload \"$TAG_NAME\"')
  expect(source).toContain('--clobber')
  expect(source).toContain('gh release edit \"$TAG_NAME\"')
  expect(source).toContain('--draft=false')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run config/scripts/fork-desktop-packages-workflow.test.mjs --pool=threads --maxWorkers=1
```

Expected: FAIL because `workflow.on.push` and `workflow.jobs.release` do not
exist.

- [ ] **Step 3: Add the tag trigger**

Extend the workflow trigger without changing manual inputs:

```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
```

- [ ] **Step 4: Add the release aggregation job**

Append a runner-scoped job after `package`:

```yaml
  release:
    if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
    needs: package
    runs-on: ubuntu-24.04
    permissions:
      contents: write

    steps:
      - name: Download desktop packages
        uses: actions/download-artifact@v8
        with:
          pattern: orca-*-${{ github.run_number }}-*
          path: release-assets
          merge-multiple: true

      - name: Create or reuse draft release
        env:
          GH_TOKEN: ${{ github.token }}
          TAG_NAME: ${{ github.ref_name }}
        shell: bash
        run: |
          set -euo pipefail
          draft="$(gh release view "$TAG_NAME" \
            --repo "$GITHUB_REPOSITORY" \
            --json isDraft \
            --jq .isDraft 2>/dev/null || true)"

          if [[ "$draft" == "false" ]]; then
            echo "Release $TAG_NAME is already published" >&2
            exit 1
          fi

          if [[ -z "$draft" ]]; then
            args=(
              release create "$TAG_NAME"
              --repo "$GITHUB_REPOSITORY"
              --title "$TAG_NAME"
              --draft
              --generate-notes
            )
            if [[ "$TAG_NAME" == *-* ]]; then
              args+=(--prerelease --latest=false)
            fi
            gh "${args[@]}"
          fi

      - name: Upload release assets
        env:
          GH_TOKEN: ${{ github.token }}
          TAG_NAME: ${{ github.ref_name }}
        shell: bash
        run: |
          set -euo pipefail
          mapfile -d '' packages < <(
            find release-assets -type f -print0
          )
          if (( ${#packages[@]} == 0 )); then
            echo "No release packages found" >&2
            exit 1
          fi
          gh release upload "$TAG_NAME" \
            --repo "$GITHUB_REPOSITORY" \
            --clobber \
            "${packages[@]}"

      - name: Publish release
        env:
          GH_TOKEN: ${{ github.token }}
          TAG_NAME: ${{ github.ref_name }}
        shell: bash
        run: >-
          gh release edit "$TAG_NAME"
          --repo "$GITHUB_REPOSITORY"
          --draft=false
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm vitest run config/scripts/fork-desktop-packages-workflow.test.mjs --pool=threads --maxWorkers=1
```

Expected: all workflow structure tests PASS.

- [ ] **Step 6: Commit the workflow behavior**

```bash
git add .github/workflows/fork-desktop-packages.yml config/scripts/fork-desktop-packages-workflow.test.mjs
git commit -m "ci: publish desktop packages for version tags"
```

### Task 2: Fork Release Documentation

**Files:**
- Modify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: The tag and manual behaviors implemented in Task 1.
- Produces: Maintainer instructions for test packages and permanent releases.

- [ ] **Step 1: Replace the package workflow documentation**

Document both paths with exact commands and outcomes:

````markdown
## Fork desktop packages

For a temporary test build, run `Fork Desktop Packages` from the Actions tab
and optionally enter a branch, tag, or SHA. The workflow uploads Windows x64,
Linux x64/ARM64, and macOS x64/ARM64 installers for 14 days.

For a permanent GitHub Release, create and push a `v*` tag:

```bash
git tag v1.4.166
git push origin v1.4.166
```

The workflow publishes the Release only after every platform succeeds. A tag
such as `v1.4.166-rc.1` creates a pre-release; `v1.4.166` creates a stable
release. GitHub generates the release notes, and attached installers remain
available until the Release or assets are deleted. A failed asset upload leaves
an unpublished draft that can be retried.

These personal Windows and macOS builds are unsigned, so SmartScreen or
Gatekeeper can warn when opening them. Publishing a Release does not change
the application's official Orca update feed.
````

- [ ] **Step 2: Run documentation and root-file checks**

Run:

```bash
git diff --check
pnpm vitest run config/scripts/check-root-directory-entries.test.mjs --pool=threads --maxWorkers=1
```

Expected: no whitespace errors and the root allowlist test passes.

- [ ] **Step 3: Commit the documentation**

```bash
git add FORK_NOTES.md
git commit -m "docs: explain permanent tag releases"
```

### Task 3: Final Verification

**Files:**
- Verify: `.github/workflows/fork-desktop-packages.yml`
- Verify: `config/scripts/fork-desktop-packages-workflow.test.mjs`
- Verify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: Evidence that the workflow structure and repository checks pass before pushing.

- [ ] **Step 1: Run the workflow and root guard tests together**

```bash
pnpm vitest run \
  config/scripts/fork-desktop-packages-workflow.test.mjs \
  config/scripts/check-root-directory-entries.test.mjs \
  --pool=threads \
  --maxWorkers=1
```

Expected: both test files pass.

- [ ] **Step 2: Validate formatting and inspect the final diff**

```bash
git diff --check HEAD~2
git status --short --branch
git log -4 --oneline
```

Expected: no whitespace errors, only intended commits are present, and the
working tree is clean.

- [ ] **Step 3: Push only after explicit user approval**

```bash
git push origin custom/main
```

Expected: `origin/custom/main` advances to the verified implementation commit.
Do not create a test version tag without explicit approval because that would
publish a public GitHub Release.
