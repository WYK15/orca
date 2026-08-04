# Chrome-Style Tab Compression Design

## Goal

Let desktop workspace tabs share available width and compress evenly to a
72px readable floor before the existing horizontal overflow navigation takes
over.

## Existing Behavior

The current tab bar already implements the selected Chrome-like behavior:

- terminal, editor, browser, and simulator tabs share one width rule;
- tabs use a flexible preferred width of 180px, or 220px on wide windows;
- tabs grow only to 280px;
- tabs shrink evenly when the strip runs out of space;
- horizontal scrolling begins after tabs reach an 88px minimum;
- activating a hidden tab scrolls it into view;
- overflow buttons, wheel navigation, drag scrolling, and the scroll position
  indicator already operate on the resulting strip width.

The fork customization changes only the readable floor from 88px to 72px.

## Width Contract

The shared desktop tab container uses these dimensions:

- default preferred width: 180px;
- preferred width at viewports of at least 1280px: 220px;
- maximum width: 280px;
- minimum width: 72px.

Every visible tab in a strip participates in the same flex sizing. Space is
distributed evenly; the active tab does not receive a wider allocation. This
avoids layout movement when switching tabs.

## Preserved Behavior

This change does not alter:

- tab labels, icons, close controls, pinned state, or rename input behavior;
- tab ordering, drag and drop, split-pane targets, or middle-click close;
- horizontal overflow navigation or active-tab visibility;
- terminal, editor, browser, or simulator state;
- macOS, Linux, Windows, SSH, or folder-workspace behavior.

No new colors, spacing values, typography, shadows, or component primitives are
introduced. Existing Orca tab chrome and design tokens remain unchanged.

## Implementation Boundary

Update the shared width class in
`src/renderer/src/components/tab-bar/tab-width-rules.ts`. Do not duplicate width
classes inside individual tab components.

Update the existing tab title/width component test so it verifies that terminal,
editor, and browser tab wrappers receive the complete shared rule with a 72px
minimum. The test must continue to verify that width ownership stays on the
outer sortable container rather than the interactive tab root.

## Verification

Run only the focused tab width/title test plus formatting and changed-file
checks. This small CSS-class customization does not require unrelated relay,
PTY, SSH, or Electron integration suites.

Record the 72px downstream customization in `FORK_NOTES.md` so a later upstream
sync can preserve it deliberately or remove it when upstream adopts the same
minimum.
