# Rich Markdown Table Insert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rich Markdown toolbar button that inserts a table through a 10-by-10 quick grid or a validated custom-size dialog.

**Architecture:** Keep insertion rules in a small domain module, with separate components for the accessible grid, custom-size dialog, and toolbar menu orchestration. Both UI paths call the same insertion function, while the existing `/table` slash command and contextual table controls remain unchanged.

**Tech Stack:** React 19, TypeScript, Tiptap, Radix-based shadcn Popover/Dialog/Input/Button primitives, Tailwind design tokens, Vitest, Testing Library.

## Global Constraints

- The selected row count means body rows; insertion adds exactly one header row.
- Quick selection supports 1–10 body rows and 1–10 columns, initially 3 by 3.
- Custom selection supports 1–100 body rows and 1–50 columns.
- Use `docs/STYLEGUIDE.md`, existing `main.css` tokens, and shadcn primitives; add no new color, typography, spacing, shadow, or radius values.
- Keep `/table` inserting its existing fixed 3-by-3 table.
- Keep contextual row and column controls unchanged.
- Add no dependency.
- Preserve `.superpowers/`, `tests/test.md`, and all unrelated user or upstream changes.
- Run only focused tests and the root-directory guard; do not run unrelated slow suites.

---

### Task 1: Shared Table Dimension and Insertion Contract

**Files:**
- Create: `src/renderer/src/components/editor/rich-markdown-table-insertion.ts`
- Create: `src/renderer/src/components/editor/rich-markdown-table-insertion.test.ts`

**Interfaces:**
- Consumes: Tiptap `Editor`.
- Produces:
  - `RichMarkdownTableDimensions = { bodyRows: number; columns: number }`
  - `RICH_MARKDOWN_TABLE_LIMITS`
  - `validateRichMarkdownTableDimensions(dimensions): boolean`
  - `insertRichMarkdownTable(editor, dimensions): boolean`

- [ ] **Step 1: Write failing validation and insertion tests**

Create `rich-markdown-table-insertion.test.ts` with a real Tiptap editor:

```ts
// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'
import {
  insertRichMarkdownTable,
  validateRichMarkdownTableDimensions
} from './rich-markdown-table-insertion'

let editor: Editor | null = null

function createEditor(): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createRichMarkdownExtensions({ codec: createRichMarkdownEditorCodec() }),
    content: 'Before',
    contentType: 'markdown'
  })
  return editor
}

function tableDimensions(currentEditor: Editor): { rows: number; columns: number } {
  let rows = 0
  let columns = 0
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name === 'tableRow') {
      rows += 1
      columns = Math.max(columns, node.childCount)
    }
  })
  return { rows, columns }
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('rich Markdown table insertion', () => {
  it.each([
    [{ bodyRows: 1, columns: 1 }, true],
    [{ bodyRows: 100, columns: 50 }, true],
    [{ bodyRows: 0, columns: 3 }, false],
    [{ bodyRows: 101, columns: 3 }, false],
    [{ bodyRows: 3, columns: 0 }, false],
    [{ bodyRows: 3, columns: 51 }, false],
    [{ bodyRows: 1.5, columns: 3 }, false]
  ] as const)('validates %j', (dimensions, expected) => {
    expect(validateRichMarkdownTableDimensions(dimensions)).toBe(expected)
  })

  it('adds one header row to the requested body rows', () => {
    const currentEditor = createEditor()
    expect(insertRichMarkdownTable(currentEditor, { bodyRows: 3, columns: 4 })).toBe(true)
    expect(tableDimensions(currentEditor)).toEqual({ rows: 4, columns: 4 })
    expect(currentEditor.getMarkdown()).toContain('| ---')
  })

  it('does not mutate the document for invalid dimensions', () => {
    const currentEditor = createEditor()
    const before = currentEditor.getMarkdown()
    expect(insertRichMarkdownTable(currentEditor, { bodyRows: 0, columns: 3 })).toBe(false)
    expect(currentEditor.getMarkdown()).toBe(before)
  })
})
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/renderer/src/components/editor/rich-markdown-table-insertion.test.ts \
  --pool=threads --maxWorkers=1
```

Expected: FAIL because `rich-markdown-table-insertion.ts` does not exist.

- [ ] **Step 3: Implement the shared insertion contract**

Create `rich-markdown-table-insertion.ts`:

```ts
import type { Editor } from '@tiptap/react'

export type RichMarkdownTableDimensions = {
  bodyRows: number
  columns: number
}

export const RICH_MARKDOWN_TABLE_LIMITS = {
  bodyRows: { min: 1, quickMax: 10, max: 100 },
  columns: { min: 1, quickMax: 10, max: 50 }
} as const

export function validateRichMarkdownTableDimensions({
  bodyRows,
  columns
}: RichMarkdownTableDimensions): boolean {
  return (
    Number.isInteger(bodyRows) &&
    bodyRows >= RICH_MARKDOWN_TABLE_LIMITS.bodyRows.min &&
    bodyRows <= RICH_MARKDOWN_TABLE_LIMITS.bodyRows.max &&
    Number.isInteger(columns) &&
    columns >= RICH_MARKDOWN_TABLE_LIMITS.columns.min &&
    columns <= RICH_MARKDOWN_TABLE_LIMITS.columns.max
  )
}

export function insertRichMarkdownTable(
  editor: Editor,
  dimensions: RichMarkdownTableDimensions
): boolean {
  if (!validateRichMarkdownTableDimensions(dimensions)) {
    return false
  }

  return editor
    .chain()
    .focus()
    .insertTable({
      rows: dimensions.bodyRows + 1,
      cols: dimensions.columns,
      withHeaderRow: true
    })
    .run()
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add \
  src/renderer/src/components/editor/rich-markdown-table-insertion.ts \
  src/renderer/src/components/editor/rich-markdown-table-insertion.test.ts
git commit -m "feat(markdown): add table insertion contract"
```

---

### Task 2: Accessible Quick Size Grid

**Files:**
- Create: `src/renderer/src/components/editor/RichMarkdownTableSizeGrid.tsx`
- Create: `src/renderer/src/components/editor/RichMarkdownTableSizeGrid.test.tsx`

**Interfaces:**
- Consumes:
  - `RichMarkdownTableDimensions`
  - `RICH_MARKDOWN_TABLE_LIMITS`
- Produces:
  - `RichMarkdownTableSizeGrid`
  - Props:

```ts
type RichMarkdownTableSizeGridProps = {
  selection: RichMarkdownTableDimensions
  onSelectionChange: (dimensions: RichMarkdownTableDimensions) => void
  onSelect: (dimensions: RichMarkdownTableDimensions) => void
}
```

- [ ] **Step 1: Write failing grid interaction tests**

Create a happy-dom Testing Library test that renders the controlled grid:

```tsx
// @vitest-environment happy-dom

import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichMarkdownTableSizeGrid } from './RichMarkdownTableSizeGrid'
import type { RichMarkdownTableDimensions } from './rich-markdown-table-insertion'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

afterEach(cleanup)

function Harness({
  onSelect
}: {
  onSelect: (dimensions: RichMarkdownTableDimensions) => void
}): React.JSX.Element {
  const [selection, setSelection] = useState({ bodyRows: 3, columns: 3 })
  return (
    <RichMarkdownTableSizeGrid
      selection={selection}
      onSelectionChange={setSelection}
      onSelect={onSelect}
    />
  )
}

describe('RichMarkdownTableSizeGrid', () => {
  it('renders a labelled 10 by 10 grid and previews hovered dimensions', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    expect(screen.getAllByRole('gridcell')).toHaveLength(100)
    const target = screen.getByRole('gridcell', { name: '4 body rows by 5 columns' })
    fireEvent.mouseEnter(target)
    expect(screen.getByText('4 body rows × 5 columns, plus 1 header row')).toBeTruthy()
    fireEvent.click(target)
    expect(onSelect).toHaveBeenCalledWith({ bodyRows: 4, columns: 5 })
  })

  it('moves selection with arrow keys and confirms with Enter', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const selectedCell = screen.getByRole('gridcell', { name: '3 body rows by 3 columns' })
    selectedCell.focus()
    fireEvent.keyDown(selectedCell, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith({ bodyRows: 4, columns: 4 })
  })

  it('confirms with Space and clamps arrow movement at grid edges', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    const edge = screen.getByRole('gridcell', { name: '1 body rows by 1 columns' })
    edge.focus()
    fireEvent.keyDown(edge, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement!, { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith({ bodyRows: 1, columns: 1 })
  })
})
```

- [ ] **Step 2: Run the grid test to verify RED**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/renderer/src/components/editor/RichMarkdownTableSizeGrid.test.tsx \
  --pool=threads --maxWorkers=1
```

Expected: FAIL because `RichMarkdownTableSizeGrid` does not exist.

- [ ] **Step 3: Implement the controlled grid**

Build `RichMarkdownTableSizeGrid.tsx` with:

```tsx
const rows = Array.from(
  { length: RICH_MARKDOWN_TABLE_LIMITS.bodyRows.quickMax },
  (_, index) => index + 1
)
const columns = Array.from(
  { length: RICH_MARKDOWN_TABLE_LIMITS.columns.quickMax },
  (_, index) => index + 1
)
```

Render a `role="grid"` container and 100 `button` elements with
`role="gridcell"`. A cell is highlighted when both its row and column are less
than or equal to `selection`. Use only existing token classes:

```tsx
className={cn(
  'size-5 rounded-xs border border-border bg-background',
  selected && 'border-primary bg-accent'
)}
```

Each cell must set:

```tsx
aria-label={`${bodyRows} body rows by ${columns} columns`}
aria-selected={selected}
tabIndex={bodyRows === selection.bodyRows && columns === selection.columns ? 0 : -1}
onMouseEnter={() => onSelectionChange({ bodyRows, columns })}
onFocus={() => onSelectionChange({ bodyRows, columns })}
onClick={() => onSelect({ bodyRows, columns })}
```

Keep refs in a map keyed by `"${bodyRows}:${columns}"`. On arrow keys, clamp
the next row/column to 1–10, update the controlled selection, and focus the next
cell. On Enter or Space, prevent the default event and call `onSelect` with the
current cell dimensions.

Render the translated status:

```tsx
`${selection.bodyRows} body rows × ${selection.columns} columns, plus 1 header row`
```

- [ ] **Step 4: Run the grid test to verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit the grid**

```bash
git add \
  src/renderer/src/components/editor/RichMarkdownTableSizeGrid.tsx \
  src/renderer/src/components/editor/RichMarkdownTableSizeGrid.test.tsx
git commit -m "feat(markdown): add table size grid"
```

---

### Task 3: Validated Custom Size Dialog

**Files:**
- Create: `src/renderer/src/components/editor/RichMarkdownTableSizeDialog.tsx`
- Create: `src/renderer/src/components/editor/RichMarkdownTableSizeDialog.test.tsx`

**Interfaces:**
- Consumes:
  - `RichMarkdownTableDimensions`
  - `RICH_MARKDOWN_TABLE_LIMITS`
- Produces:

```ts
type RichMarkdownTableSizeDialogProps = {
  open: boolean
  initialDimensions: RichMarkdownTableDimensions
  onOpenChange: (open: boolean) => void
  onInsert: (dimensions: RichMarkdownTableDimensions) => boolean
}
```

- [ ] **Step 1: Write failing dialog tests**

Mock the dialog primitives as pass-through components so the tests exercise the
form rather than Radix portals. Cover inherited values, invalid values, cancel,
success, and command failure:

```tsx
// @vitest-environment happy-dom

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichMarkdownTableSizeDialog } from './RichMarkdownTableSizeDialog'

vi.mock('@/components/ui/dialog', async () => {
  const React_ = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement(React_.Fragment, null, children)
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? children : null,
    DialogContent: passthrough,
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough
  }
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

afterEach(cleanup)

function renderDialog(onInsert = vi.fn(() => true), onOpenChange = vi.fn()) {
  render(
    <RichMarkdownTableSizeDialog
      open
      initialDimensions={{ bodyRows: 4, columns: 5 }}
      onOpenChange={onOpenChange}
      onInsert={onInsert}
    />
  )
  return { onInsert, onOpenChange }
}

describe('RichMarkdownTableSizeDialog', () => {
  it('inherits dimensions and submits valid integers', () => {
    const { onInsert, onOpenChange } = renderDialog()
    expect(screen.getByLabelText('Body rows')).toHaveValue(4)
    expect(screen.getByLabelText('Columns')).toHaveValue(5)
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    expect(onInsert).toHaveBeenCalledWith({ bodyRows: 4, columns: 5 })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ['Body rows', '', 'Enter a whole number from 1 to 100'],
    ['Body rows', '1.5', 'Enter a whole number from 1 to 100'],
    ['Body rows', '101', 'Enter a whole number from 1 to 100'],
    ['Columns', '51', 'Enter a whole number from 1 to 50']
  ])('rejects invalid %s value %s', (label, value, message) => {
    const { onInsert } = renderDialog()
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('closes without insertion on cancel', () => {
    const { onInsert, onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('stays open and reports an insertion failure', () => {
    const { onOpenChange } = renderDialog(vi.fn(() => false))
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    expect(screen.getByText('Could not insert table')).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run the dialog test to verify RED**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/renderer/src/components/editor/RichMarkdownTableSizeDialog.test.tsx \
  --pool=threads --maxWorkers=1
```

Expected: FAIL because `RichMarkdownTableSizeDialog` does not exist.

- [ ] **Step 3: Implement the custom-size dialog**

Use controlled string state for both inputs so empty and decimal values remain
representable. Reset both strings and the command error whenever `open` becomes
true or `initialDimensions` changes.

Use this parser inside the focused component:

```ts
function parseDimension(raw: string, max: number): number | null {
  if (!/^\d+$/.test(raw)) {
    return null
  }
  const value = Number(raw)
  return value >= 1 && value <= max ? value : null
}
```

Use `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`,
`DialogDescription`, `DialogFooter`, `Input`, and `Button`. Each input must use
`type="number"`, `min`, `max`, `step={1}`, `aria-invalid`, and an
`aria-describedby` link to its inline validation text.

On form submit:

```ts
if (bodyRows === null || columns === null) {
  return
}
setCommandError(false)
if (onInsert({ bodyRows, columns })) {
  onOpenChange(false)
} else {
  setCommandError(true)
}
```

The Cancel button calls `onOpenChange(false)`. Pass `open` and `onOpenChange`
to the root `Dialog` so Escape follows the same non-mutating close path.

- [ ] **Step 4: Run the dialog test to verify GREEN**

Run the Step 2 command.

Expected: PASS.

- [ ] **Step 5: Commit the custom dialog**

```bash
git add \
  src/renderer/src/components/editor/RichMarkdownTableSizeDialog.tsx \
  src/renderer/src/components/editor/RichMarkdownTableSizeDialog.test.tsx
git commit -m "feat(markdown): add custom table size dialog"
```

---

### Task 4: Toolbar Menu and Editor Integration

**Files:**
- Create: `src/renderer/src/components/editor/RichMarkdownTableInsertMenu.tsx`
- Create: `src/renderer/src/components/editor/RichMarkdownTableInsertMenu.test.tsx`
- Create: `src/renderer/src/components/editor/RichMarkdownToolbar.test.tsx`
- Modify: `src/renderer/src/components/editor/RichMarkdownToolbar.tsx`

**Interfaces:**
- Consumes:
  - `RichMarkdownTableSizeGrid`
  - `RichMarkdownTableSizeDialog`
  - `insertRichMarkdownTable`
- Produces:

```ts
export function RichMarkdownTableInsertMenu({
  editor
}: {
  editor: Editor | null
}): React.JSX.Element
```

- [ ] **Step 1: Write failing menu orchestration tests**

In `RichMarkdownTableInsertMenu.test.tsx`, mock Popover, Tooltip, grid, dialog,
and the editor insertion module. The Popover mock must capture its `open` and
`onOpenChange` props; the grid and dialog mocks must capture their complete
props. Reset all captures in `beforeEach`. Wrap direct captured-callback calls
in Testing Library's `act` so React commits state before the assertion:

```ts
it('opens custom size with the current grid selection', () => {
  render(<RichMarkdownTableInsertMenu editor={editor} />)
  fireEvent.click(screen.getByRole('button', { name: 'Table' }))
  act(() => capturedGridProps.onSelectionChange({ bodyRows: 7, columns: 8 }))
  fireEvent.click(screen.getByRole('button', { name: 'Custom size' }))
  expect(capturedDialogProps.open).toBe(true)
  expect(capturedDialogProps.initialDimensions).toEqual({ bodyRows: 7, columns: 8 })
})

it('closes quick selection only after successful insertion', () => {
  insertRichMarkdownTableMock.mockReturnValueOnce(false).mockReturnValueOnce(true)
  render(<RichMarkdownTableInsertMenu editor={editor} />)
  act(() => capturedGridProps.onSelect({ bodyRows: 2, columns: 4 }))
  expect(capturedPopoverProps.open).toBe(true)
  expect(screen.getByText('Could not insert table')).toBeTruthy()
  act(() => capturedGridProps.onSelect({ bodyRows: 2, columns: 4 }))
  expect(capturedPopoverProps.open).toBe(false)
  expect(screen.queryByText('Could not insert table')).toBeNull()
})

it('closes on Escape without inserting', () => {
  render(<RichMarkdownTableInsertMenu editor={editor} />)
  fireEvent.click(screen.getByRole('button', { name: 'Table' }))
  act(() => capturedPopoverProps.onOpenChange(false))
  expect(capturedPopoverProps.open).toBe(false)
  expect(insertRichMarkdownTableMock).not.toHaveBeenCalled()
})

it('returns false without a command when the editor is unavailable', () => {
  render(<RichMarkdownTableInsertMenu editor={null} />)
  expect(capturedDialogProps.onInsert({ bodyRows: 3, columns: 3 })).toBe(false)
  expect(insertRichMarkdownTableMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Write the failing toolbar placement test**

In `RichMarkdownToolbar.test.tsx`, mock `RichMarkdownToolbarButton`,
`RichMarkdownTableInsertMenu`, and `RichMarkdownTableToolbar` to simple markup,
then render `RichMarkdownToolbar` to static markup. Assert that the insertion
menu marker appears after the Image button and before the contextual table
toolbar marker:

```ts
expect(markup.indexOf('aria-label="Image"')).toBeLessThan(
  markup.indexOf('data-table-insert-menu="true"')
)
expect(markup.indexOf('data-table-insert-menu="true"')).toBeLessThan(
  markup.indexOf('data-contextual-table-toolbar="true"')
)
```

- [ ] **Step 3: Run both integration tests to verify RED**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/renderer/src/components/editor/RichMarkdownTableInsertMenu.test.tsx \
  src/renderer/src/components/editor/RichMarkdownToolbar.test.tsx \
  --pool=threads --maxWorkers=1
```

Expected: FAIL because the menu does not exist and the toolbar does not render
it.

- [ ] **Step 4: Implement `RichMarkdownTableInsertMenu`**

Use state initialized to:

```ts
const [popoverOpen, setPopoverOpen] = useState(false)
const [dialogOpen, setDialogOpen] = useState(false)
const [selection, setSelection] = useState<RichMarkdownTableDimensions>({
  bodyRows: 3,
  columns: 3
})
const [quickInsertFailed, setQuickInsertFailed] = useState(false)
```

Compose the existing `Popover`, `PopoverTrigger`, `PopoverContent`, Tooltip
primitives, `RichMarkdownTableSizeGrid`, and `RichMarkdownTableSizeDialog`.
The trigger uses `Table2`, `rich-markdown-toolbar-button`, the translated
`Table` label, and `onMouseDown={(event) => event.preventDefault()}`.

Use one insertion callback:

```ts
const handleInsert = useCallback(
  (dimensions: RichMarkdownTableDimensions): boolean => {
    return editor ? insertRichMarkdownTable(editor, dimensions) : false
  },
  [editor]
)
```

For quick selection, close the popover and clear its failure message only when
`handleInsert` returns `true`; otherwise keep it open and render translated
`Could not insert table`. The `Custom size` button closes the popover and opens
the dialog without changing the document.

- [ ] **Step 5: Add the menu to the rich Markdown toolbar**

Import `RichMarkdownTableInsertMenu` into `RichMarkdownToolbar.tsx` and render:

```tsx
<RichMarkdownTableInsertMenu editor={editor} />
<RichMarkdownTableToolbar editor={editor} />
```

immediately after the existing Image toolbar button. Do not modify the slash
command catalog or `RichMarkdownTableToolbar`.

- [ ] **Step 6: Run menu, toolbar, and existing table action tests**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/renderer/src/components/editor/RichMarkdownTableInsertMenu.test.tsx \
  src/renderer/src/components/editor/RichMarkdownToolbar.test.tsx \
  src/renderer/src/components/editor/rich-markdown-table-actions.test.ts \
  --pool=threads --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 7: Commit the toolbar integration**

```bash
git add \
  src/renderer/src/components/editor/RichMarkdownTableInsertMenu.tsx \
  src/renderer/src/components/editor/RichMarkdownTableInsertMenu.test.tsx \
  src/renderer/src/components/editor/RichMarkdownToolbar.test.tsx \
  src/renderer/src/components/editor/RichMarkdownToolbar.tsx
git commit -m "feat(markdown): add table insertion menu"
```

---

### Task 5: Fork Note and Focused Verification

**Files:**
- Modify: `FORK_NOTES.md`

**Interfaces:**
- Consumes: The completed table insertion feature.
- Produces: A persistent downstream customization note.

- [ ] **Step 1: Record the persistent fork customization**

Add this item under `## Persistent customizations`:

```markdown
- Rich Markdown's toolbar provides a 10×10 table-size grid and a validated
  custom-size dialog; selected rows are body rows and insertion adds a header.
```

- [ ] **Step 2: Run all focused feature tests and the root guard**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run \
  --config config/vitest.config.ts \
  src/renderer/src/components/editor/rich-markdown-table-insertion.test.ts \
  src/renderer/src/components/editor/RichMarkdownTableSizeGrid.test.tsx \
  src/renderer/src/components/editor/RichMarkdownTableSizeDialog.test.tsx \
  src/renderer/src/components/editor/RichMarkdownTableInsertMenu.test.tsx \
  src/renderer/src/components/editor/RichMarkdownToolbar.test.tsx \
  src/renderer/src/components/editor/rich-markdown-table-actions.test.ts \
  config/scripts/check-root-directory-entries.test.mjs \
  --pool=threads --maxWorkers=1
```

Expected: all listed tests PASS.

- [ ] **Step 3: Run static change checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Only the intended `FORK_NOTES.md` change and
the pre-existing untracked `.superpowers/` and `tests/test.md` remain.

- [ ] **Step 4: Commit the fork note**

```bash
git add FORK_NOTES.md
git commit -m "docs: record markdown table insertion menu"
```

- [ ] **Step 5: Inspect the completed commit range**

Run:

```bash
git log --oneline -8
git diff --stat HEAD~5..HEAD
git status --short
```

Expected: five focused implementation/documentation commits, with
`.superpowers/` and `tests/test.md` still untracked and untouched.

- [ ] **Step 6: Do not push without approval**

Report the focused verification result and commit hashes. Ask for explicit
approval before pushing `custom/main`.
