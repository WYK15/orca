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
```

Set `ORCA_MARKDOWN_CHECK_BROWSER=webkit` to run the same browser checks in WebKit.
Install that development browser with `pnpm exec playwright install webkit`.

Remaining Typora parity work includes complete inline math/footnotes, broader
HTML styling, table mouse selection and caret refinements, focus/typewriter
modes and export integration. This implementation is a testable replacement,
not a claim that every Typora interaction is already identical.
