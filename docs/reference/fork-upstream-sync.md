# Fork Upstream Sync

This operational reference governs stable upstream tracking and Orcaw customization replay. [`FORK_NOTES.md`](../../FORK_NOTES.md) owns the customization registry and desktop-package release details.

## Branch responsibilities

`upstream-sync` matches one stable `stablyai/orca` release exactly. It contains no Orcaw commits and may advance ahead of the base adopted by `main`.

`main` is the releasable Orcaw branch. After the initial migration, its downstream layer consists of registered customization commits followed by the current release-version commit.

Use temporary `sync/v<version>-wyk.1` branches for adoption work. Delete them after adoption or abandonment.

## Track a stable upstream release

Run the `Fork Upstream Sync` workflow with an explicit stable tag:

```bash
gh workflow run fork-upstream-sync.yml -f upstream_tag=v1.4.187
```

The workflow validates the tag and package version, requires a fast-forward from the current `upstream-sync` by default, and updates only that branch. It rejects release candidates and never modifies `main` or creates release tags.

When two stable release histories diverge, first compare their common ancestor, the commits unique to each history, the release package versions, and the published release metadata. After explicit approval, dispatch with `allow_non_fast_forward=true`. The workflow archives the previous branch at `archive/upstream-sync-before-v<target>` and replaces `upstream-sync` with `--force-with-lease`; it refuses the replacement if the remote moved or a pre-existing archive points elsewhere. This exceptional path updates only the pure upstream tracking branch. It never adopts the release into `main`; replay, hunk audit, and the normal `main` replacement remain separate steps.

Verify the result:

```bash
git fetch origin
git fetch upstream refs/tags/v1.4.187:refs/tags/v1.4.187
git diff --quiet origin/upstream-sync v1.4.187
```

## Register a customization

Before merging behavior that must survive an upstream adoption:

1. Add a unique `ORCAW-NNN` row to the customization registry.
2. Record its contract, principal scope, verification, introduction version, and upstream relationship.
3. Keep the behavior in an isolated commit with this trailer:

   ```text
   Fork-Customization: ORCAW-NNN
   ```

4. Run:

   ```bash
   pnpm run verify:fork-customizations
   ```

Use `active` for intentional Orcaw differences and `upstream-candidate` when upstream may provide equivalent behavior. Both statuses remain replay-required.

## Prepare an adoption candidate

Fetch current refs, preserve the old release, and create a candidate:

```bash
git fetch origin upstream --tags
OLD_MAIN="$(git rev-parse origin/main)"
git tag -a "archive/pre-sync-v1.4.178-wyk.3" "$OLD_MAIN" \
  -m "Archive Orcaw before upstream adoption"
git switch -c sync/v1.4.187-wyk.1 origin/main
git rebase --onto origin/upstream-sync upstream-base/v1.4.178
```

Replace the example versions with the actual adopted and target stable versions. Keep the archive tag immutable.

Drop historical `chore(release)` commits during replay. Generate one new release-version commit after customization validation.

## Resolve or rewrite a customization

Handle one registered customization at a time:

- A clean replay keeps the same `ORCAW-NNN` trailer.
- A structural conflict is rewritten against the new upstream interface while preserving the registered contract and verification.
- A partially equivalent upstream implementation shrinks the downstream commit to the remaining Orcaw behavior.
- Uncertain equivalence keeps the customization unchanged.
- Before completion, compare the candidate with explicitly selected legacy PR diff hunks. Record every hunk as replayed, upstream-equivalent with evidence, retired, or intentionally not replayed; never infer scope from a commit title or scan unrelated files.

Run the focused tests named by the registry before continuing the replay.

## Confirm upstream equivalence

Retirement requires all of the following:

1. Identify the upstream commit, pull request, or stable release.
2. Compare the registered contract and boundary cases.
3. Run the registry verification against the upstream implementation.
4. Verify Orcaw-specific identity, remote, folder-workspace, and platform cases where relevant.
5. Obtain explicit approval to retire the customization.

After approval, omit the commit from replay and change its registry status to `retired`. Record the replacing upstream version. Automation may identify candidates but never approves retirement.

## Validate a candidate

Run the single candidate gate from a clean worktree:

```bash
pnpm verify:fork-upstream-adoption -- v1.4.187 HEAD
```

The gate verifies the stable tag and package version, candidate ancestry, registry structure, exact-one customization replay coverage, and owned commits. It runs one deduplicated Vitest invocation for the registry's verification paths. To rerun one customization's tests after a local remediation, use `--id ORCAW-NNN`; global registry and replay checks still run.

Validate the new release version only after `main` replacement:

```bash
node config/scripts/fork-release-contract.mjs --release \
  v1.4.187 1.4.187 1.4.187-wyk.1 v1.4.187-wyk.1
```

### Validation budget

Run a changed customization's direct tests after its change. Run the aggregate selected matrix once after its replay milestone; do not rerun passing unrelated suites unless a dependency changes or a new failure warrants it. Test-harness changes require only the affected Node and browser-environment suites. Select the required Node version before every test command.

Perform an independent contract audit before replacing `main`: verify each registry contract against the current code and selected legacy hunks, inspect workflow triggers as well as workflow tests, record deviations, and rerun only the direct test after each remediation. Registry and exact-one coverage do not prove functional equivalence.

## Replace main safely

Fetch and record the live remote head immediately before replacement:

```bash
git fetch origin main
OBSERVED_MAIN="$(git rev-parse origin/main)"
git push origin HEAD:main \
  --force-with-lease="refs/heads/main:$OBSERVED_MAIN"
git fetch origin main
test "$(git rev-parse origin/main)" = "$(git rev-parse HEAD)"
```

A lease failure means the remote changed. Stop and inspect the new commits instead of retrying with a weaker force option.

## Version and publish

For the first release on a newly adopted base, use `<upstream-version>-wyk.1`. Increment `wyk.N` for later releases on the same base.

Keep the candidate at the upstream package version until `main` has been replaced and verified. Then create and fast-forward the release-version commit on `main`, validate the release contract, and create the matching immutable tag. The tag triggers the signed/notarized package workflow; monitor that workflow and verify its uploaded assets before declaring the release complete.

Create `upstream-base/v<upstream-version>` only after `main` adopts that base. Keep package versions, updater metadata, assets, and the `v<upstream-version>-wyk.N` release tag aligned. Follow the desktop package instructions in [`FORK_NOTES.md`](../../FORK_NOTES.md#fork-desktop-packages).

## Abort or roll back

Before replacing `main`, abort by deleting the candidate branch; `main` remains unchanged.

After replacement, restore the immutable archive with an explicit lease:

```bash
git fetch origin main
OBSERVED_MAIN="$(git rev-parse origin/main)"
git push origin archive/pre-sync-v1.4.178-wyk.3:main \
  --force-with-lease="refs/heads/main:$OBSERVED_MAIN"
```

Published release and upstream-base tags never move. To roll back an exceptional `upstream-sync` replacement before a `main` adoption, restore its archive tag with `--force-with-lease` after recording the observed remote head; do not move the archive tag.

## Initial migration status

A `main` without a current `upstream-base/v*` tag uses legacy downstream history. Its first stable adoption requires a target-specific migration plan that classifies old releases, documentation, upstream backports, active customizations, and upstream candidates before replay.

The initial replay consolidates the synchronization foundation into one commit carrying:

```text
Fork-Customization: ORCAW-015
```

No candidate is removed until its upstream equivalence is explicitly confirmed.
