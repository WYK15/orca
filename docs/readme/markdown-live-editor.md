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

Additional parity work includes math/diagrams, advanced HTML, clipboard formats,
focus/typewriter modes and export. Record verified coverage here as work proceeds.

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
```

Set `ORCA_MARKDOWN_CHECK_BROWSER=webkit` to run the same browser checks in WebKit.
Install that development browser with `pnpm exec playwright install webkit`.

## Core writing acceptance

The writing interaction check runs the following workflows in Chrome and WebKit:

| Workflow | Checked behavior |
| --- | --- |
| Headings | Wait for content, reveal the prefix, convert the current paragraph, switch levels and restore plain text |
| Inline formatting | Toggle bold/italic/code, preserve nested styles, clear formatting and keep the selected text |
| History | Undo formatting independently of preceding typing, including in table cells |
| Lists | Indent/outdent an item together with its nested children |
| Table creation | Enter after a typed pipe-delimited header creates the table and focuses a body cell |
| Table input | Toolbar and keyboard commands use the actual cell selection; copy/cut retain shared history |
| Table paste | TSV and HTML grids fill a rectangular range, expand the table and undo as one operation |
| Cross-block selection | Tables stay rendered while selected; copying/cutting and undo use the same source selection |
| Clipboard | Ordinary copy supplies rendered text and HTML; explicit Markdown copy/source mode retain syntax; plain paste skips HTML conversion |
| Links | Inline, reference and bare URLs resolve through the existing file owner; reference definitions stay hidden in reading mode |
| Typing | Bracket pairing, closing-character skipping and paired deletion work without changing fence completion |

Remaining gaps from the Typora comparison:

- Richer table selection, row/column drag ordering and a table-size picker.
- Complete link/image editing panels, image sizing and asset-folder preferences.
- Complete inline math/footnotes, YAML front matter, inline HTML and extended syntax.
- Nested quote presentation, multi-item list operations and precise caret restoration in every history case.
- Focus/typewriter modes, writing-layout preferences, word count/spellcheck and export integration.
- Native macOS input-method acceptance and large-document performance measurements.

This remains a phased replacement. Passing the checks above does not assert that
every Typora interaction is already identical.
