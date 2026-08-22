# Upstream Sync and Customization Replay Design

## Goal

Keep Orcaw current with stable upstream Orca releases while preserving a small, explicit, reviewable customization layer. Upstream tracking and upstream adoption remain separate operations.

## Branch Model

The repository has two long-lived branches:

- `upstream-sync` is an unmodified mirror of the latest selected stable upstream release. It contains no Orcaw commits.
- `main` is the current releasable Orcaw branch. Its history is the adopted upstream base followed by the active Orcaw customization commits and one current release-version commit.

A temporary `sync/v<version>-wyk.1` branch may be used while adopting a new upstream base. It is deleted after the candidate replaces `main` or the attempt is abandoned.

`upstream-sync` may advance without immediately changing `main`. The currently adopted upstream version is recorded independently.

## Permanent References

Each adopted upstream base receives an immutable tag:

```text
upstream-base/v1.4.178
```

Each Orcaw release keeps its existing immutable release tag:

```text
v1.4.178-wyk.1
```

Before replacing `main`, create a recovery tag:

```text
archive/pre-sync-v1.4.178-wyk.3
```

Old customization commits remain reachable through old release and recovery tags but are absent from the current `main` after replay.

## Customization Registry

`FORK_NOTES.md` is the canonical human-readable customization registry. It records intent rather than commit SHA because replay changes commit identities.

Every persistent customization has a stable ID such as `ORCAW-004` and records:

- purpose and user-visible contract;
- first Orcaw release;
- principal modules or files;
- behavior that must survive migration;
- tests or manual verification;
- current status;
- related upstream pull requests or releases when known.

Valid statuses are:

- `active`: must be replayed;
- `upstream-candidate`: upstream may provide an equivalent implementation, pending review;
- `retired`: equivalence was confirmed and the local customization was removed.

Retired entries remain as concise historical records, including the upstream version that replaced them.

Every persistent customization commit carries a stable trailer:

```text
Fork-Customization: ORCAW-004
```

A new persistent customization must receive an ID, registry entry, isolated replayable commit, and migration verification before entering `main`.

## Commit Classification

Commits in the downstream layer have distinct roles:

- `Fork-Customization: ORCAW-NNN` identifies persistent downstream behavior.
- `Upstream-Backport: stablyai/orca#NNNN` identifies temporary upstream changes adopted early.
- `chore(release)` records the current Orcaw package version and is regenerated for each adopted upstream base.
- Any downstream behavior that must survive the next adoption, including a fix not yet accepted upstream, receives a `Fork-Customization` ID. Once upstream accepts an equivalent, it follows the candidate and retirement workflow.

Backports and release commits are not persistent customization records.

## Tracking a Stable Upstream Release

Only formal stable upstream releases are eligible. Release candidates are not adopted for Orcaw releases.

For initial setup, create `upstream-sync` directly at the selected stable release. For later updates:

1. Fetch the upstream repository and tags.
2. Verify that the target is a stable release.
3. Confirm that it descends from the current `upstream-sync` tip; unexpected history rewrites require manual review.
4. Fast-forward `upstream-sync` to the selected release commit.
5. Verify that its tree matches the upstream release exactly.

This operation does not modify `main`.

## Adopting a New Upstream Base

1. Ensure the worktree is clean and identify the current `upstream-base` tag.
2. Create an immutable recovery tag for the current `main`.
3. Create a temporary sync candidate from `main`.
4. Replay commits after the old upstream base onto `upstream-sync`.
5. Drop prior release-version commits.
6. Handle each customization or backport independently.
7. Regenerate derived files such as the lockfile.
8. Set the new version to `<upstream-version>-wyk.1`.
9. Run registry, identity, update, packaging, and affected-area verification.
10. After explicit approval, replace `main` with the candidate and push using `--force-with-lease`.
11. Create the new immutable upstream-base and Orcaw release tags.
12. Delete the temporary candidate branch.

`main` history may be rewritten only through this controlled adoption workflow. Release and recovery tags are never rewritten.

## Conflict and Retirement Rules

Each replayed customization is evaluated separately:

- If it applies cleanly, retain its stable ID and intent.
- If upstream changed the surrounding structure, rewrite the customization against the new structure and retain the same ID.
- If upstream provides only part of the behavior, shrink the customization to the remaining Orcaw-specific difference.
- If upstream appears equivalent, mark the customization `upstream-candidate` and keep it until review is complete.
- If behavior, boundaries, and relevant Orcaw scenarios are confirmed equivalent, explicitly approve retirement, omit the customization from the replay, and mark it `retired`.
- If equivalence is uncertain, retain the customization.
- If an upstream backport is included in the new base, omit the backport after verifying its upstream commit or equivalent behavior is present.

No script may automatically retire a persistent customization.

## Versioning

Orcaw versions preserve the adopted upstream version:

```text
upstream 1.4.178 -> 1.4.178-wyk.1
                    1.4.178-wyk.2
upstream 1.4.179 -> 1.4.179-wyk.1
```

Rules:

- the upstream part changes only when `main` adopts a new stable upstream base;
- the fork revision increments for additional releases on the same base;
- the fork revision resets to `1` after adopting a new base;
- `package.json`, release tags, updater metadata, and release assets must agree;
- prior release tags remain immutable.

## Verification

A sync candidate may replace `main` only when:

1. `upstream-sync` matches the selected stable upstream release.
2. Each `active` customization ID appears exactly once in the current replay layer.
3. No `upstream-candidate` was removed without explicit confirmation.
4. The package version matches the adopted upstream version and fork revision.
5. Generated files are current and the worktree is clean.
6. Orcaw product identity, isolated user data, command names, update source, and inherited-cron policy remain intact.
7. Tests covering every conflicted or rewritten area pass.
8. Desktop packaging and release-workflow contract checks pass.

Automation may prepare branches, validate records, and run checks. It must not resolve semantic conflicts, approve retirements, replace `main`, or create a release tag without human confirmation.

## Failure and Recovery

A failed replay or verification deletes only the temporary candidate; `main` remains unchanged.

If a defect is found after replacing `main`, restore the recovery tag through a lease-protected update. Published release tags are never moved or reused.

During adoption, avoid creating long-lived branches from the old `main`. Existing feature branches rebase onto the new `main` after adoption.

## Initial Migration

The first adoption requires a one-time cleanup of the current downstream history:

1. classify the existing fork-only commits as persistent customizations, upstream backports, release commits, documentation, or superseded work;
2. assign stable IDs to confirmed persistent customizations;
3. combine fragmented commits only when they implement one customization contract;
4. mark possible upstream equivalents as candidates rather than removing them;
5. replay the curated customization set onto the chosen stable upstream base;
6. preserve the current history through existing releases and a recovery tag.

Subsequent adoptions replay only this curated layer.

## Alternatives Considered

### Merge upstream into `main`

This preserves downstream commit SHAs but interleaves frequent upstream merges with the customization history. The current upstream pace and overlapping hot files make the customization layer harder to identify and retire.

### Never rewrite `main`

This avoids lease-protected updates but leaves both old and replacement customization commits in ancestry and requires additional merge mechanics. It weakens the ability to define the current customization layer by commit range.

### Store customizations only as patch files

Patch files make the overlay portable but duplicate Git's native commit storage and add maintenance tooling. A clean replayable commit series plus stable customization IDs provides the needed portability without a second source of truth.

## Decision

Use a pure `upstream-sync` branch and a controlled, replay-based `main`. Track persistent customization intent in `FORK_NOTES.md`, preserve identity with stable trailers, require explicit confirmation before retirement, and align every Orcaw release version with its adopted stable upstream base.
