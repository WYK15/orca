# Markdown live editor

Branch: `refactor/markdown-live-editor`.

## Contract

- Markdown source is authoritative. Rendering never serializes a document tree.
- An edit changes only the addressed source range. Preserve untouched bytes,
  including mixed line endings, entities, HTML, indentation and table spacing.
- Live, source and reading views share one document, selection and undo history.
- Typora's inline syntax reveal, lists, code, tables, images and keyboard flows
  are the interaction reference. Orca's style tokens remain authoritative.
- Chinese composition, undo/redo, external reloads, workspace switching and
  pending saves must remain safe before this becomes the default personal editor.
- Retain the existing editor for Electron and as a recovery path. Do not publish
  or run Actions until the new implementation has been checked locally.

## Implementation

CodeMirror 6 holds normalized text and incremental syntax trees. A source field
applies its transactions to the original text and records source restorations in
undo history. Decorations supply the live view without changing the source.
Tables patch cell ranges and structural operations patch only the selected table.
Images reuse the existing authorized local/SSH/runtime file boundary.

The application continues to own drafts, saves, conflict detection, workspace
identity and filesystem operations. The editor reports source changes immediately;
pending-save flushes synchronously read the same source field.

## Acceptance

1. Open/save without editing is byte-identical; deleting a paragraph or editing
   one table cell changes only that source region, including in existing manuals.
2. Inline-code boundaries, list Enter/Shift+Enter/Backspace, code fences and
   cross-block selection behave predictably without trapping the caret.
3. Tables remain rendered while editing cells; Tab/Shift+Tab and row/column
   actions work, with one undo history and no focus loss during composition.
4. Relative images, pasted/dropped images, links and outline navigation work for
   both folder workspaces and Git worktrees using the file owner's host.
5. Switching source/live/reading views preserves source, selection and undo.
6. Saves, external reloads, close/reopen and switching projects preserve drafts;
   unsupported syntax remains locally editable instead of blocking the document.

Feature coverage and the remaining compatibility gaps are recorded below.
The browser checks cover both Chrome and WebKit; native macOS acceptance remains separate.

## First integrated implementation

The personal Tauri build now routes editable Markdown and reading previews to
the new engine. Source/live switches share one history; file switches retain a
bounded in-memory session cache. Conflict and existing paused-save recovery
continue to use the established source editor.

Verified in Chrome and Playwright WebKit:

- Open/save is byte-identical, including mixed line endings.
- Cell editing preserves neighboring table spacing, entities and text; Tab adds
  a row and retains focus. Source/live switches and remounts retain undo/redo.
- List Enter, hard breaks, marker-only Backspace, inline-code escape, fence
  completion, code-block exit and slash commands on continuation lines work.
- All six ATX heading levels wait for title content before live rendering. Bare
  hashes and trailing whitespace remain visible; the caret can reveal the prefix.
- Table context menus target the right-clicked cell, with row/column insertion,
  deletion, clearing and alignment. Column operations preserve neighboring cell
  spacing; header insertion/deletion retains a valid Markdown table.
- Structural edits retain a rendered input and are individually undoable. Restored
  source carets enter the corresponding cell. Short body rows materialize only
  the missing cells being edited; extra cell text is retained.
- Table cells support save/search, Tab/Shift+Tab, boundary arrow navigation,
  Shift+Enter line breaks, Cmd/Ctrl+Enter insertion below and
  Cmd/Ctrl+Shift+Backspace row deletion. Escape returns to the document.
- Chrome composition commits Chinese without duplication; WebKit insertion and
  table focus work. Native macOS input methods still need hands-on acceptance.
- Reading previews remain read-only; local-image presentation and HTML details,
  display math, Mermaid and formatted HTML paste render without rewriting files.
- Search focus, real-file saves and light/dark layouts pass browser checks.

Read-only copies of the user's iOS and Windows integration manuals and
`MConclusion.md` were loaded and edited without changing unrelated source.
The original documents were not written.

The browser fixture writes only its own temporary Markdown file. Run from the
repository root:

```sh
pnpm exec vite --config tests/tools/markdown-live-editor/vite.config.ts
node tests/tools/markdown-live-editor/verify.mjs
node tests/tools/markdown-live-editor/verify-table-interactions.mjs
node tests/tools/markdown-live-editor/verify-writing-interactions.mjs
node tests/tools/markdown-live-editor/verify-document-features.mjs
node tests/tools/markdown-live-editor/verify-table-grid.mjs
node tests/tools/markdown-live-editor/verify-resources-and-export.mjs
node tests/tools/markdown-live-editor/verify-image-layout.mjs
```

Set `ORCA_MARKDOWN_CHECK_BROWSER=webkit` to run the same browser checks in WebKit.
Install that development browser with `pnpm exec playwright install webkit`.

## Core writing acceptance

The writing interaction check runs the following workflows in Chrome and WebKit:

| Workflow              | Checked behavior                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Headings              | Wait for content, reveal the prefix, convert the current paragraph, switch levels and restore plain text                           |
| Inline formatting     | Toggle bold/italic/code, preserve nested styles, clear formatting and keep the selected text                                       |
| History               | Undo formatting independently of preceding typing, including in table cells                                                        |
| Lists                 | Indent/outdent an item together with its nested children                                                                           |
| Table creation        | Enter after a typed pipe-delimited header creates the table and focuses a body cell                                                |
| Table input           | Toolbar and keyboard commands use the actual cell selection; copy/cut retain shared history                                        |
| Table paste           | TSV and HTML grids fill a rectangular range, expand the table and undo as one operation                                            |
| Cross-block selection | Tables stay rendered while selected; copying/cutting and undo use the same source selection                                        |
| Clipboard             | Ordinary copy supplies rendered text and HTML; explicit Markdown copy/source mode retain syntax; plain paste skips HTML conversion |
| Links                 | Inline, reference and bare URLs resolve through the existing file owner; reference definitions stay hidden in reading mode         |
| Typing                | Bracket pairing, closing-character skipping and paired deletion work without changing fence completion                             |

## Document feature acceptance

The document interaction check covers these workflows in Chrome and WebKit:

| Feature   | Checked behavior                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata  | Closed YAML at the document start is distinct from headings; collapse/reveal, scalar/sequence/error states, literal Enter and exact undo; reading mode hides it               |
| Body TOC  | Case-insensitive `[TOC]`, six heading levels, duplicate anchors, live updates and internal link navigation                                                                    |
| Math      | Inline and multiline display formulas, literal code and currency, local source editing, Enter completion and shared history; formulas also render in table cells              |
| Footnotes | First-reference numbering, repeated and undefined references, indented continuation, hover previews, local definition editing, footer/backlink navigation and reading mode    |
| HTML      | Common inline tags, allowed authored styles, owner-authorized images and details; click to edit local source; scripts/events stay inactive and unsupported tags remain source |
| Geometry  | Block-widget spacing stays inside measured bounds so links and text after TOCs, tables and formulas map to source positions                                                   |

These additions keep the original Markdown as the only saved representation.
Rendering, note numbering and generated TOCs do not rewrite the document.
YAML and formulas use literal line breaks while their source is active; Cmd/Ctrl+Enter
exits the block. Source mode retains normal code-editor Enter behavior.

## Tables, resources and writing acceptance

The table-grid and resource/export checks exercise these workflows in both browsers:

| Feature        | Checked behavior                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table regions  | Shift-click, pointer drag, keyboard expansion and whole row/column/table selection; copy rendered HTML/TSV, clear and fill a region, paste spreadsheets and undo without touching neighboring cells     |
| Table ordering | Drag row/column handles or use the menu; preserve alignment, short rows, extra cell text and mixed EOLs; one undo reverses a move                                                                       |
| Table creation | Keyboard-accessible 10×10 size grid and a custom-size dialog; dimensions count body rows plus one header                                                                                                |
| Links          | Cmd/Ctrl+K and the toolbar open an edit panel, including inside table cells; changing a reference occurrence leaves its shared definition and other occurrences intact                                  |
| Images         | Edit paths, alt text, title and pixel dimensions; explicit dimensions use a local HTML image; HTML images retain their edit menu; stale panels cannot overwrite newer content                           |
| Writing        | Persist focus/typewriter modes, spelling, reading/full width and a relative image directory; show text/selection counts and caret position                                                              |
| Export         | Standalone HTML and native printing/PDF use a complete independent source parse, including offscreen headings, math and notes; embed images and formula fonts, render diagrams and omit editor controls |

Image layout checks cover short captions, large and small natural sizes, portrait
ratios, inline placement, source reveal, reading mode and narrow editor widths.
Both Chrome and WebKit must preserve the image aspect ratio without caption-driven
shrinkage or rewriting Markdown.

Image folders apply to subsequent imports, pastes and drops. `{filename}.assets`
resolves beside the Markdown document on its owner's platform; existing image
paths are not relocated. Operations retain the existing file-owner authorization.
Referenced link/image edits convert only the chosen occurrence to an inline form.
Image sizing uses standard HTML attributes so Markdown source remains portable.

HTML export opens a save dialog; printing opens a separate document window and
uses the system print dialog, where PDF is available on macOS. The print window
has no main-window IPC permission and accepts navigation only within its temporary
file. Closing it removes that file. Export uses a captured source snapshot and
never writes back to the Markdown file. Remote images must be readable through
the existing image loader for self-contained export to succeed.

Remaining gaps from the Typora comparison:

- Nested footnote definitions/references inside tables and other containers; broader extended-syntax compatibility.
- Full HTML/CSS fidelity and configurable math syntax; unsupported constructs remain local source.
- Nested quote presentation, multi-item list operations and precise caret restoration in every history case.
- Native macOS input-method and system print-dialog acceptance; large-document performance measurements.

This remains a phased replacement. Passing the checks above does not assert that
every Typora interaction is already identical.
