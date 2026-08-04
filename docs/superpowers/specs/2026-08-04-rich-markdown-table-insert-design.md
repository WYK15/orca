# Rich Markdown Table Insert Design

## Goal

Add a table button to the rich Markdown toolbar. The button opens a fast
10-by-10 size grid and supports larger tables through a custom-size dialog.

## Scope

- Enhance only the rich Markdown toolbar.
- Keep the existing `/table` slash command unchanged.
- Keep the existing in-table row and column controls unchanged.
- Reuse Tiptap's table insertion command and the existing table extensions.

## User Model

The selected row count always means body rows. Every inserted Markdown table
also receives one header row. For example, selecting 3 by 4 creates four total
rows and four columns.

## Toolbar Entry

Add a table button after the image button in `RichMarkdownToolbar`. Use the
existing toolbar button, tooltip, icon, shadcn primitives, and design tokens.
The button remains visible whether or not the cursor is inside a table.

The contextual table row and column controls from the upstream backport remain
visible only while the cursor is inside an existing table.

## Quick Size Grid

Clicking the table button opens a popover containing a 10-by-10 grid. Hovering
or focusing a cell highlights the rectangle from the upper-left cell through
the current cell. A status label describes the selection explicitly, for
example:

> 3 body rows × 3 columns, plus 1 header row

Clicking a cell inserts the selected table immediately and closes the popover.
Keyboard users can move through the grid with the arrow keys and select with
Enter or Space. Escape closes the popover without changing the document.
Expose the selector as an accessible grid with an explicit label for each size.

The initial selection is 3 body rows by 3 columns.

## Custom Size Dialog

The popover footer provides a `Custom size` action. It opens a dialog with
separate numeric inputs for body rows and columns. The inputs inherit the
current quick-grid selection and use these inclusive limits:

- Body rows: 1–100
- Columns: 1–50

Empty, non-integer, and out-of-range values show concise inline validation and
disable the Insert action. Cancel and Escape close the dialog without changing
the document.

## Component Boundaries

- `RichMarkdownTableInsertMenu` owns the toolbar entry and coordinates popover
  and dialog state.
- `RichMarkdownTableSizeGrid` owns the accessible 10-by-10 quick selector.
- `RichMarkdownTableSizeDialog` owns custom-size input and validation feedback.
- `rich-markdown-table-insertion.ts` validates dimensions and runs the editor
  command.

The insertion module receives body rows and columns, validates them, and calls:

```ts
editor
  .chain()
  .focus()
  .insertTable({
    rows: bodyRows + 1,
    cols: columns,
    withHeaderRow: true
  })
  .run()
```

The extra row represents the table header. Keeping this calculation outside the
UI gives both quick and custom insertion one contract.

## Failure Behavior

Invalid dimensions never reach the editor command. Close the active surface
only after the command returns `true`. If insertion fails, keep the surface
open, show a concise error, and leave the document unchanged. Closing either
surface without confirmation does not mutate the document.

## Styling and Compatibility

Follow `docs/STYLEGUIDE.md`, the tokens in
`src/renderer/src/assets/main.css`, and the shadcn primitives in
`src/renderer/src/components/ui/`. Do not introduce new color, typography,
spacing, shadow, or radius values.

The feature runs entirely in the renderer and introduces no platform-specific,
filesystem, Git, SSH, or workspace assumptions.

## Tests

Add focused tests for:

- Dimension validation and the body-row-to-total-row conversion.
- Successful insertion with a header row and the requested column count.
- Quick-grid hover, focus, arrow-key navigation, Enter, Space, and Escape.
- Custom-size validation, inherited values, cancel, and successful submission.
- Toolbar entry placement and coexistence with the existing contextual table
  controls.

Run only these focused tests and the root-directory guard during implementation,
consistent with the user's request to avoid unrelated slow test suites.

## Fork Maintenance

Treat this as a persistent downstream customization and add a concise entry to
`FORK_NOTES.md`. Keep the implementation in focused files and commits so a
future upstream table-insertion feature can replace it cleanly.
