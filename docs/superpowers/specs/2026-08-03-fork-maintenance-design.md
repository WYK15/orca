# Fork Maintenance Guidance

## Goal

Treat this repository as a long-lived downstream Orca fork while keeping local fixes and features maintainable as upstream evolves.

## Rule Location

`AGENTS.md` is the canonical instruction source. `CLAUDE.md` continues to contain only `@AGENTS.md`, so the guidance has one maintained copy.

## Guidance

Add a `Fork Maintenance` section that requires agents to:

- Keep changes small, focused, and easy to reconcile with upstream.
- Separate generally useful fixes from personal customizations in code and commits.
- Add proportionate tests and consider regressions caused by later upstream changes.
- Preserve upstream and user changes instead of rewriting or discarding them.
- Retain an upstream-sync path without prescribing remote or branch names.
- Record only material, persistent upstream differences in `FORK_NOTES.md`, creating it when such differences first exist.

The guidance does not impose a fixed branching model because repository remotes and release practices may change.

## Verification

Confirm that `AGENTS.md` contains the new section, `CLAUDE.md` still references `AGENTS.md`, and the Markdown remains concise and unambiguous.
