# Stable Fork Release Design

## Goal

Publish `vX.Y.Z-wyk.N` tags as normal GitHub Releases while preserving the
fork-specific SemVer sequence and existing update discovery behavior.

## Design

Add a small release-publication classifier used by the tag workflow. Exact
`vX.Y.Z-wyk.N` tags and plain stable tags are normal releases; other valid
hyphenated versions such as RC, beta, hourly, and adhoc tags remain
pre-releases. Invalid tags fail before GitHub Release creation.

The workflow remains responsible for building every platform, verifying all
required assets, and publishing only after every package succeeds. Package
version `1.4.165-wyk.5` matches tag `v1.4.165-wyk.5`.

## Update behavior

The updater continues to compare the SemVer value from the tag and package.
A running `wyk` build includes fork pre-release SemVer versions in its feed
search, independent of GitHub's Release/pre-release UI classification.
Linux retains automatic installation. Unsigned macOS and Windows builds find
the new version but open its exact Release page for manual installation.

## Validation

Unit tests execute the classifier against stable fork, plain stable,
pre-release, and invalid tags. Workflow contract tests verify that Release
creation consumes the classifier. Existing updater, package identity, release
asset, localization, and type checks remain green before the tag is pushed.

