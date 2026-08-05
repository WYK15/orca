# Browser Title Stability Manual Test

## Goal

Provide a deterministic local page that reproduces the transient `page-title-updated` sequence behind the browser-tab width jitter, then package the fixed Windows app for sequential comparison with `v1.4.165-wyk.4`.

## Test fixture

Add a focused manual fixture under `tests/manual/browser-title-stability/`:

- `index.html` renders the test status, event count, and start/stop control.
- `serve.mjs` serves only that directory over loopback HTTP with no third-party dependencies.
- The page repeatedly sets a spinner title and immediately restores `Orcaw title stability test`.

The rapid same-turn title pair is intentional: Electron may deliver the earlier spinner event after the WebView's current title has already returned to the stable value. The old app trusts the event payload and changes the tab label; the fixed app reads the current WebView title and remains stable.

## Visual design

The standalone page uses the documented Orca roles for background, foreground, card, muted, border, primary, focus ring, radius, and Geist typography. It supports light and dark color schemes, keeps color neutral, and uses visible button labels rather than icon-only controls.

## Comparison procedure

1. Start the fixture with `node tests/manual/browser-title-stability/serve.mjs`.
2. Open the printed loopback URL as a browser tab in the installed `v1.4.165-wyk.4`.
3. Confirm the page counter advances while the Orcaw tab label and neighboring tab positions visibly oscillate.
4. Close the old app.
5. Build and run `dist/win-unpacked/Orcaw.exe`.
6. Open the same URL and confirm the page counter advances while the Orcaw tab remains `Orcaw title stability test` without width jitter.

## Packaging

Use the existing `build:unpack` script. The expected executable is `dist/win-unpacked/Orcaw.exe`. The test fixture is a repository-only manual diagnostic and is excluded from packaged application files by the existing electron-builder configuration.

## Verification

- Automated tests verify the fixture serves HTML, uses loopback by default, and emits the transient/stable title pair.
- Existing focused browser-title tests remain green.
- The unpacked executable exists and launches.
- Manual comparison follows the sequential procedure above so the two builds do not share a live single-instance lock.
