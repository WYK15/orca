# Rich Markdown Safe HTML Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a restricted safe subset of authored HTML in Orca's rich Markdown editor while preserving exact source and falling back losslessly for unsupported input.

**Architecture:** A bounded source parser produces a validated immutable tree from exact Markdown source. New inline and block Tiptap atoms carry source only, project the validated tree into DOM without HTML string sinks, and expose source editing through focused node views. Preprocessing, clipboard reconstruction, edited drafts, and programmatic updates all reparse at the trust boundary.

**Tech Stack:** TypeScript, Tiptap/ProseMirror, DOM APIs, `decode-named-character-reference`, Vitest, Testing Library, happy-dom, existing Orca Markdown transport and link routing.

## Global Constraints

- Follow `docs/STYLEGUIDE.md`, tokens from `src/renderer/src/assets/main.css`, and existing shadcn primitives for application UI.
- Never use `innerHTML`, `insertAdjacentHTML`, JSX raw HTML injection, or an equivalent HTML string sink.
- Inline source is limited to 16 KiB; block source is limited to 64 KiB; nesting is limited to eight element levels including the root.
- Store and serialize exact authored source; never normalize quoting, whitespace, casing, entities, or `<br>` spelling.
- Unsupported, malformed, unsafe, or over-limit input must use the existing lossless raw HTML nodes.
- Keep the existing specialized `<details>` and superscript-link behavior ahead of generic safe HTML handling.
- Do not recursively parse Markdown inside HTML.
- Use existing platform-aware Markdown link routing; never hardcode `metaKey`.
- Keep changes renderer-only and compatible with local worktrees, folder workspaces, WSL, and SSH-backed documents.
- Add only `decode-named-character-reference@1.3.0` as the deterministic entity decoder; do not add any other dependency.
- Do not disable `max-lines` or run unrelated full test suites.
- Preserve untracked `.superpowers/` and `tests/test.md`.

---

## File Structure

- Create `src/renderer/src/components/editor/rich-markdown-safe-html-source.ts` for bounded parsing, attribute/style validation, source matching, and safe tree types.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts` for parser, grammar, limit, and adversarial tests.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html-style.ts` for the explicit safe CSS grammar.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html-style.test.ts` for accepted and rejected CSS values.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html-dom.ts` for DOM projection and rendered-tree comparison.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html-dom.test.ts` for DOM sink and projection tests.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.ts` for inline/block preview and source-editing node views.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.test.ts` for selection, editing, IME, and stale-position tests.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html.ts` for Tiptap extensions, Markdown tokenization, serialization, and clipboard validation.
- Create `src/renderer/src/components/editor/rich-markdown-safe-html.test.ts` for extension, clipboard, and fallback tests.
- Create `src/renderer/src/components/editor/raw-markdown-html.test.ts` for preprocessing precedence and raw fallback tests.
- Modify `src/renderer/src/components/editor/rich-markdown-source-transport.ts` to add safe transport kinds.
- Modify `src/renderer/src/components/editor/raw-markdown-html.ts` to recognize complete safe fragments before generic raw HTML.
- Modify `src/renderer/src/components/editor/rich-markdown-extensions.ts` to register safe nodes before raw nodes.
- Modify `src/renderer/src/components/editor/rich-markdown-editor-click-routing.ts` to route anchors nested in safe HTML atoms.
- Modify `src/renderer/src/components/editor/rich-markdown-editor-click-routing.test.ts` for safe-node links across local and remote contexts.
- Modify `src/renderer/src/components/editor/markdown-round-trip.test.ts` for exact-source and rich-mode regressions.
- Modify `src/renderer/src/components/editor/useRichMarkdownProgrammaticSync.test.ts` for external replacement behavior.
- Modify `src/renderer/src/assets/rich-markdown-editor.css` for token-based node selection and source fields.
- Modify `package.json` and `pnpm-lock.yaml` to make the already transitively present entity decoder an explicit renderer dependency.
- Modify `FORK_NOTES.md` after the feature is complete.

---

### Task 1: Bounded Safe HTML Source Parser

**Files:**
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-source.ts`
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts`
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-style.ts`
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-style.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces:

```ts
export const SAFE_HTML_INLINE_BYTE_LIMIT = 16 * 1024
export const SAFE_HTML_BLOCK_BYTE_LIMIT = 64 * 1024
export const SAFE_HTML_NESTING_LIMIT = 8

export type RichMarkdownSafeHtmlKind = 'inline' | 'block'
export type RichMarkdownSafeHtmlText = { type: 'text'; value: string }
export type RichMarkdownSafeHtmlElement = {
  type: 'element'
  tagName: 'a' | 'span' | 'u' | 'mark' | 'sub' | 'sup' | 'kbd' | 'br' |
    'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  attributes: Readonly<Record<string, string>>
  styles: Readonly<Record<string, string>>
  children: readonly RichMarkdownSafeHtmlNode[]
}
export type RichMarkdownSafeHtmlNode =
  | RichMarkdownSafeHtmlText
  | RichMarkdownSafeHtmlElement
export type RichMarkdownSafeHtmlFragment = {
  kind: RichMarkdownSafeHtmlKind
  source: string
  root: RichMarkdownSafeHtmlElement
}
export type RichMarkdownSafeHtmlParseStats = { transitions: number }

export function parseRichMarkdownSafeHtml(
  source: string,
  expectedKind?: RichMarkdownSafeHtmlKind,
  stats?: RichMarkdownSafeHtmlParseStats
): RichMarkdownSafeHtmlFragment | null

export function matchRichMarkdownSafeHtml(
  content: string,
  start: number,
  kind: RichMarkdownSafeHtmlKind
): RichMarkdownSafeHtmlFragment | null
```

- Parsing must not depend on DOM globals so source tests run in the normal Node Vitest environment.

- [ ] **Step 1: Add the deterministic entity decoder**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm add decode-named-character-reference@1.3.0
```

Expected: `package.json` records the direct dependency and the lockfile reuses
the existing `1.3.0` package. Do not update unrelated dependencies.

- [ ] **Step 2: Write failing allowlist and exact-source tests**

```ts
it.each([
  '<a href="https://example.com" title="Docs">link</a>',
  '<span style="color: #fff"><u>text</u></span>',
  '<mark>marked</mark>',
  '<sub>x</sub>',
  '<sup>2</sup>',
  '<kbd>Ctrl</kbd>',
  '<br>',
  '<br/>',
  '<br />'
])('parses safe inline source exactly: %s', (source) => {
  const parsed = parseRichMarkdownSafeHtml(source, 'inline')
  expect(parsed?.source).toBe(source)
  expect(parsed?.kind).toBe('inline')
})

it.each(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])(
  'parses a safe %s block with inline descendants',
  (tag) => {
    const source = `<${tag}><span>Alpha &amp; Beta</span><br>Tail</${tag}>`
    const parsed = parseRichMarkdownSafeHtml(source, 'block')
    expect(parsed?.source).toBe(source)
    expect(parsed?.root.tagName).toBe(tag)
  }
)
```

- [ ] **Step 3: Run the parser test and verify it fails**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because `rich-markdown-safe-html-source.ts` does not exist.

- [ ] **Step 4: Implement the tokenizer and immutable tree**

Implement a cursor-based parser with functions named:

```ts
function parseElement(cursor: HtmlCursor, depth: number): RichMarkdownSafeHtmlElement | null
function parseOpeningTag(cursor: HtmlCursor): ParsedOpeningTag | null
function parseChildren(cursor: HtmlCursor, parentTag: SafePairedTag, depth: number):
  readonly RichMarkdownSafeHtmlNode[] | null
function decodeHtmlCharacterReferences(value: string): string | null
```

Require one complete root, matching closing tags, safe descendants, no trailing
bytes, no newline in inline fragments, and a block root at line start. Retain
`source` separately from decoded text and attributes. Recognize only
semicolon-terminated references and decode each matched body through
`decodeNamedCharacterReference`; reject a syntactically reference-like token
that the decoder does not recognize. Never use a DOM parser or HTML string sink.

- [ ] **Step 5: Add failing attribute, protocol, and style grammar tests**

```ts
it.each([
  '<a href="javascript:alert(1)">x</a>',
  '<a href="jav&#x61;script:alert(1)">x</a>',
  '<a href="data:text/html,x">x</a>',
  '<a href="x" href="y">x</a>',
  '<span onclick="go()">x</span>',
  '<span class="orca">x</span>',
  '<span style="position: fixed">x</span>',
  '<span style="color: red; color: blue">x</span>',
  '<span style="background: url(x)">x</span>',
  '<span style="color: var(--foreground)">x</span>',
  '<br style="color:red">'
])('rejects unsafe source: %s', (source) => {
  expect(parseRichMarkdownSafeHtml(source)).toBeNull()
})

it.each([
  '<a href="#section">x</a>',
  '<a href="./guide.md">x</a>',
  '<a href="file:///tmp/guide.md">x</a>',
  '<a href="mailto:a@example.com">x</a>',
  '<span style="font-size: 72px; font-weight: 700; text-decoration: underline line-through">x</span>',
  '<span style="background: hsl(10 20% 30%); font-style: italic">x</span>'
])('accepts safe attributes and styles: %s', (source) => {
  expect(parseRichMarkdownSafeHtml(source)).not.toBeNull()
})
```

- [ ] **Step 6: Implement explicit attribute, href, entity, and CSS grammars**

Use named validators:

```ts
function validateAttributes(tagName: SafeTag, attributes: readonly ParsedAttribute[]):
  { attributes: Readonly<Record<string, string>>; styles: Readonly<Record<string, string>> } | null
function validateSafeHtmlHref(value: string): string | null
export function parseRichMarkdownSafeHtmlStyle(
  value: string
): Readonly<Record<string, string>> | null
```

Validate the exact ranges and values from the design. Reject CSS escapes,
`url()`, `var()`, `!important`, unknown properties/functions, duplicate
properties, and an unknown explicit URL scheme after entity/whitespace decoding.
Keep the CSS grammar in `rich-markdown-safe-html-style.ts` so the structural
parser and the named-color table remain independently reviewable and stay below
the repository's line limit.

- [ ] **Step 7: Add failing limit, malformed-input, and bounded-scan tests**

```ts
it('enforces byte limits rather than UTF-16 length', () => {
  const source = `<span>${'界'.repeat(6_000)}</span>`
  expect(source.length).toBeLessThan(SAFE_HTML_INLINE_BYTE_LIMIT)
  expect(parseRichMarkdownSafeHtml(source, 'inline')).toBeNull()
})

it.each([
  '<span><u>x</span></u>',
  '<span><!--x--></span>',
  '<span><Widget /></span>',
  '<p><p>nested block</p></p>',
  '<span>line\nbreak</span>',
  '<span>unterminated'
])('rejects malformed or out-of-scope source: %s', (source) => {
  expect(parseRichMarkdownSafeHtml(source)).toBeNull()
})

it('rejects a ninth element level', () => {
  const source = `${'<span>'.repeat(9)}x${'</span>'.repeat(9)}`
  expect(parseRichMarkdownSafeHtml(source)).toBeNull()
})
```

Pass `{ transitions: 0 }` through the public optional `stats` argument and
assert `transitions < input.length * 8` for long unterminated tags, attribute
runs, and mismatched closing-tag runs.

- [ ] **Step 8: Run parser and style tests and verify they pass**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts src/renderer/src/components/editor/rich-markdown-safe-html-style.test.ts --pool=threads --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 9: Commit the parser**

```bash
git add package.json pnpm-lock.yaml src/renderer/src/components/editor/rich-markdown-safe-html-source.ts src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts src/renderer/src/components/editor/rich-markdown-safe-html-style.ts src/renderer/src/components/editor/rich-markdown-safe-html-style.test.ts
git commit -m "feat(markdown): parse safe HTML fragments"
```

---

### Task 2: Exact-Source Transport and Markdown Recognition

**Files:**
- Modify: `src/renderer/src/components/editor/rich-markdown-source-transport.ts`
- Modify: `src/renderer/src/components/editor/raw-markdown-html.ts`
- Create: `src/renderer/src/components/editor/raw-markdown-html.test.ts`

**Interfaces:**
- Consumes: `matchRichMarkdownSafeHtml(content, start, kind)`.
- Extends `RichMarkdownSourceKind` with `'safe-inline-html' | 'safe-block-html'`.
- Produces preprocessing tokens containing only exact source.

- [ ] **Step 1: Write failing recognition-precedence tests**

Add a helper that calls `encodeRawMarkdownHtmlForRichEditor` with a fixed codec
key, then assert:

```ts
expect(encoded).toContain(transport.startFor('safe-inline-html'))
expect(encoded).not.toContain(transport.startFor('inline-html'))
```

Cover a safe `<span>`, safe `<br>`, multiline `<p>`, unsupported `<div>`,
unsafe `<a href="javascript:...">`, fenced code, inline code, escaped tags, an
editable `<details>`, and the existing specialized `<sup><a>` source.

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/raw-markdown-html.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because safe transport kinds are absent.

- [ ] **Step 3: Extend the keyed transport**

Add both literal union members and both alternatives to
`TRANSPORT_BODY_PATTERN`. Keep foreign keyed envelopes and legacy prefixes
reserved exactly as before.

- [ ] **Step 4: Add the safe matcher before raw matchers**

In `encodeRawMarkdownHtmlForRichEditor`:

1. Preserve fenced code, inline code, details, superscript links, authored
   transport prefixes, and doc-link ordering.
2. At a line start, try a safe block match before `matchBlockHtml`.
3. At any unescaped `<`, try a safe inline match before `matchInlineHtml`.
4. Store `fragment.source`, never the parsed tree.

- [ ] **Step 5: Run focused tests and verify they pass**

Run the Task 2 command. Expected: PASS with existing raw HTML round trips
unchanged.

- [ ] **Step 6: Commit transport recognition**

```bash
git add src/renderer/src/components/editor/rich-markdown-source-transport.ts src/renderer/src/components/editor/raw-markdown-html.ts src/renderer/src/components/editor/raw-markdown-html.test.ts
git commit -m "feat(markdown): transport safe HTML source"
```

---

### Task 3: Safe DOM Projection

**Files:**
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-dom.ts`
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-dom.test.ts`

**Interfaces:**
- Consumes: `RichMarkdownSafeHtmlFragment` from Task 1.
- Produces:

```ts
export function createRichMarkdownSafeHtmlDom(
  fragment: RichMarkdownSafeHtmlFragment,
  ownerDocument?: Document
): HTMLElement

export function safeHtmlDomMatchesFragment(
  element: HTMLElement,
  fragment: RichMarkdownSafeHtmlFragment,
  allowedRootAttributes: readonly string[]
): boolean
```

- [ ] **Step 1: Write failing DOM projection tests**

Use `// @vitest-environment happy-dom` and assert:

```ts
const parsed = parseRichMarkdownSafeHtml(
  '<p style="color: red"><span>Alpha &amp; Beta</span><br>Tail</p>',
  'block'
)!
const element = createRichMarkdownSafeHtmlDom(parsed)
expect(element.outerHTML).toBe(
  '<p style="color: red;"><span>Alpha &amp; Beta</span><br>Tail</p>'
)
expect(element.querySelectorAll('*')).toHaveLength(2)
```

Spy on the `innerHTML` and `insertAdjacentHTML` setters/methods before projection
and assert neither is invoked. Assert no projected element gains `on*`,
`class`, `id`, `data-*`, or an unvalidated style property.

- [ ] **Step 2: Run the DOM test and verify it fails**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/rich-markdown-safe-html-dom.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because the DOM projector does not exist.

- [ ] **Step 3: Implement recursive DOM construction**

Create each element with `ownerDocument.createElement(node.tagName)`, append text
using `createTextNode`, assign `href`/`title` with `setAttribute`, and apply each
validated style via `element.style.setProperty`. Do not accept source strings in
this module.

```ts
function createElement(node: RichMarkdownSafeHtmlElement, document: Document): HTMLElement {
  const element = document.createElement(node.tagName)
  for (const [name, value] of Object.entries(node.attributes)) {
    element.setAttribute(name, value)
  }
  for (const [property, value] of Object.entries(node.styles)) {
    element.style.setProperty(property, value)
  }
  for (const child of node.children) {
    element.append(
      child.type === 'text' ? document.createTextNode(child.value) : createElement(child, document)
    )
  }
  return element
}
```

- [ ] **Step 4: Implement strict clipboard projection comparison**

`safeHtmlDomMatchesFragment` must compare tag names, decoded text, child order,
allowed attributes, and normalized projected styles. It must reject unexpected
nodes/attributes and allow only the caller-supplied private marker attributes
on the root.

```ts
const expected = createRichMarkdownSafeHtmlDom(fragment, element.ownerDocument)
return compareProjectedElement(element, expected, new Set(allowedRootAttributes), true)
```

- [ ] **Step 5: Run DOM tests and verify they pass**

Run the Task 3 command. Expected: PASS.

- [ ] **Step 6: Commit DOM projection**

```bash
git add src/renderer/src/components/editor/rich-markdown-safe-html-dom.ts src/renderer/src/components/editor/rich-markdown-safe-html-dom.test.ts
git commit -m "feat(markdown): project safe HTML DOM"
```

---

### Task 4: Tiptap Safe HTML Nodes and Clipboard Validation

**Files:**
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html.ts`
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html.test.ts`
- Modify: `src/renderer/src/components/editor/rich-markdown-extensions.ts`

**Interfaces:**
- Consumes parser, DOM projection, and source transport.
- Produces:

```ts
export const RICH_MARKDOWN_SAFE_HTML_INLINE_NODE = 'richMarkdownSafeHtmlInline'
export const RICH_MARKDOWN_SAFE_HTML_BLOCK_NODE = 'richMarkdownSafeHtmlBlock'

export function createRichMarkdownSafeHtmlExtensions(
  transport: RichMarkdownSourceTransport
): AnyExtension[]
```

- Each node has `{ source: string }`; parsed trees are never stored in document
  attributes.

- [ ] **Step 1: Write failing Markdown-node and exact-round-trip tests**

Create an editor with `createRichMarkdownExtensions`, then assert safe inline
and block node names exist, raw node names do not exist for accepted fragments,
and `editor.getMarkdown()` returns byte-for-byte source apart from the existing
document-level trailing-newline convention.

Also inject a malformed safe transport payload directly and assert tokenization
does not create a safe node.

- [ ] **Step 2: Run extension tests and verify they fail**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/rich-markdown-safe-html.test.ts src/renderer/src/components/editor/markdown-round-trip.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because safe extensions are absent.

- [ ] **Step 3: Implement the inline and block extensions**

For each extension:

- Use an atom/selectable node in the correct group.
- Match the corresponding keyed transport kind.
- Reparse the transport value with the expected kind.
- Create a node containing only `source`.
- Serialize with `String(node.attrs.source ?? '')`.
- Render text from the parsed tree's decoded text.
- Register safe nodes before raw nodes in `createRichMarkdownExtensions`.

```ts
markdownTokenizer: {
  name,
  level: kind,
  start: transport.startFor(transportKind),
  tokenize(source) {
    const matched = transport.match(source, transportKind)
    const parsed = matched && parseRichMarkdownSafeHtml(matched.value, kind)
    return matched && parsed
      ? { type: name, raw: matched.raw, safeHtmlSource: parsed.source, block: kind === 'block' }
      : undefined
  }
},
renderMarkdown: (node) => String(node.attrs?.source ?? '')
```

- [ ] **Step 4: Write failing clipboard tests**

Assert a copied node renders a versioned root marker and exact-source attribute.
Then pass valid, forged, stale-version, extra-attribute, mismatched-projection,
unsafe-source, and oversized elements through `parseHTML`. Only the valid
projection may recreate a safe node.

- [ ] **Step 5: Implement private clipboard validation**

Use distinct versioned markers for inline and block roots. Reparse the exact
source, verify expected kind and byte limit, then call
`safeHtmlDomMatchesFragment`. Allow only the private marker, private source,
and ProseMirror's `data-pm-slice` on the root.

Plain text serialization must remain exact source. Do not promote arbitrary
external clipboard HTML.

```ts
const source = element.getAttribute(SOURCE_ATTRIBUTE)
const parsed = source && parseRichMarkdownSafeHtml(source, kind)
return parsed && safeHtmlDomMatchesFragment(element, parsed, ROOT_MARKER_ATTRIBUTES)
  ? { source: parsed.source }
  : false
```

- [ ] **Step 6: Run extension tests and verify they pass**

Run the Task 4 command. Expected: PASS.

- [ ] **Step 7: Commit safe extensions**

```bash
git add src/renderer/src/components/editor/rich-markdown-safe-html.ts src/renderer/src/components/editor/rich-markdown-safe-html.test.ts src/renderer/src/components/editor/rich-markdown-extensions.ts src/renderer/src/components/editor/markdown-round-trip.test.ts
git commit -m "feat(markdown): add safe HTML nodes"
```

---

### Task 5: Preview and Source-Editing Node Views

**Files:**
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.ts`
- Create: `src/renderer/src/components/editor/rich-markdown-safe-html-node-view.test.ts`
- Modify: `src/renderer/src/components/editor/rich-markdown-safe-html.ts`
- Modify: `src/renderer/src/assets/rich-markdown-editor.css`

**Interfaces:**
- Produces:

```ts
export type RichMarkdownSafeHtmlNodeViewOptions = {
  kind: RichMarkdownSafeHtmlKind
  rawInlineNodeName: 'rawMarkdownHtmlInline'
  rawBlockNodeName: 'rawMarkdownHtmlBlock'
}

export function createRichMarkdownSafeHtmlNodeView(
  options: RichMarkdownSafeHtmlNodeViewOptions
): NodeViewRenderer
```

- [ ] **Step 1: Write failing preview and selection tests**

Mount a real Tiptap editor in happy-dom. Assert the default node view contains
the projected safe DOM and no form control. Dispatch a `NodeSelection` to its
position and assert inline creates an `<input>` while block creates a
`<textarea>`, both initialized with exact source.

Construct a safe node with a deliberately invalid source attribute through a
direct ProseMirror transaction and assert the node view reports one scoped
renderer error and shows the exact source through `textContent`; it must not
attempt string-to-DOM parsing.

- [ ] **Step 2: Run node-view tests and verify they fail**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/rich-markdown-safe-html-node-view.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because node views are absent.

- [ ] **Step 3: Implement preview/edit mode switching**

Use `selectNode` and `deselectNode` on the ProseMirror node-view contract.
Rebuild preview from a freshly parsed `source`. In edit mode:

- Inline uses `input[type="text"]`.
- Block uses `textarea`.
- Both set an accessible label such as `Edit HTML source`.
- `stopEvent` returns true for events from the form control.
- `ignoreMutation` returns true for view-owned DOM mutations.

Use only existing `--background`, `--foreground`, `--border`, `--ring`,
`--muted`, `--muted-foreground`, and documented radius/spacing values in
`rich-markdown-editor.css`.

If reparsing a supposedly safe node fails, build a `<code>` fallback, assign
`source` through `textContent`, and call:

```ts
console.error('[rich-markdown-safe-html] Invalid safe HTML node source')
```

- [ ] **Step 4: Write failing commit, cancel, and IME tests**

Cover:

- Inline Enter commits.
- Block Enter commits and Shift+Enter inserts a newline.
- Blur commits.
- Escape cancels.
- `compositionstart` suppresses Enter/Escape; `compositionend` restores them.
- Valid same-kind source updates the node.
- Valid other-kind source replaces it with the other safe node.
- Unsafe or malformed source replaces it with the matching raw HTML node and
  retains exact draft.
- A removed/replaced node makes `getPos()` invalid and discards the stale draft.

- [ ] **Step 5: Implement transactional draft commit**

On commit, parse the draft without trusting the old kind. Resolve `getPos()`
inside the event handler and verify the current node identity. Use:

```ts
const replacementType = parsed
  ? view.state.schema.nodes[
      parsed.kind === 'inline'
        ? RICH_MARKDOWN_SAFE_HTML_INLINE_NODE
        : RICH_MARKDOWN_SAFE_HTML_BLOCK_NODE
    ]
  : view.state.schema.nodes[
      options.kind === 'inline' ? options.rawInlineNodeName : options.rawBlockNodeName
    ]
```

Create the replacement with `{ source: draft }` for safe nodes or
`{ value: draft }` for raw nodes. For a same-group replacement, use
`tr.replaceWith(pos, pos + current.nodeSize, replacement)`. For an inline/block
kind change, use
`tr.replaceRangeWith(pos, pos + current.nodeSize, replacement)` so ProseMirror
can split or lift the surrounding paragraph to produce a valid document.
Tests must cover converting an atom surrounded by text and assert the text
before and after it remains in separate valid paragraphs around the new block.
Do not catch an invalid position and retry elsewhere.

- [ ] **Step 6: Reconcile programmatic updates**

In `update(updatedNode)`, accept only the same safe node type, refresh the
preview when not editing, and update the draft only when not composing and the
user has not changed it locally. Return false when the node type changes.

- [ ] **Step 7: Run node-view tests and verify they pass**

Run the Task 5 command. Expected: PASS.

- [ ] **Step 8: Commit node views**

```bash
git add src/renderer/src/components/editor/rich-markdown-safe-html-node-view.ts src/renderer/src/components/editor/rich-markdown-safe-html-node-view.test.ts src/renderer/src/components/editor/rich-markdown-safe-html.ts src/renderer/src/assets/rich-markdown-editor.css
git commit -m "feat(markdown): edit safe HTML source"
```

---

### Task 6: Safe HTML Link Routing

**Files:**
- Modify: `src/renderer/src/components/editor/rich-markdown-safe-html.ts`
- Modify: `src/renderer/src/components/editor/rich-markdown-editor-click-routing.ts`
- Modify: `src/renderer/src/components/editor/rich-markdown-editor-click-routing.test.ts`

**Interfaces:**
- Safe node attributes remain source-only.
- Produces:

```ts
export function findRichMarkdownSafeHtmlHref(
  source: string,
  clickedElement: Element | null,
  safeHtmlRoot: HTMLElement
): string | null
```

The function reparses source, determines the clicked anchor's index within
`safeHtmlRoot.querySelectorAll('a')`, flattens validated anchors from the parsed
tree in document order, confirms the DOM anchor projection still matches, and
returns only the href at that index.

- [ ] **Step 1: Write failing click-routing tests**

Create safe inline/block node selections with HTTP, relative Markdown, `file:`,
and hash hrefs. Simulate Command on Mac and Control on Linux/Windows and assert:

- Plain click does not open.
- The platform modifier activates through `activateMarkdownLink`.
- Shift plus the platform modifier preserves existing client-OS escape
  behavior.
- Hash href scrolls in the editor.
- SSH/runtime ownership is forwarded unchanged.
- Clicking non-anchor content in the same atom does nothing.

- [ ] **Step 2: Run click-routing tests and verify they fail**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/rich-markdown-editor-click-routing.test.ts --pool=threads --maxWorkers=1
```

Expected: FAIL because safe atom anchors are not recognized.

- [ ] **Step 3: Add safe atom link extraction**

When `nodeAt(pos)` is a safe HTML atom, locate the nearest anchor within that
node view from `event.target`, verify it belongs to the clicked atom, reparse the
node source, and return only the matching validated href. Feed that href through
the existing hash, Shift, local-file guard, runtime owner, and
`activateMarkdownLink` branches.

Do not add a new link opener or duplicate provider/runtime policy.

```ts
const safeRoot = view.nodeDOM(pos)
const safeHref =
  safeRoot instanceof HTMLElement && event.target instanceof Element
    ? findRichMarkdownSafeHtmlHref(String(clickedNode.attrs.source ?? ''), event.target, safeRoot)
    : null
```

Pass `safeHref` into the existing `href` branches only when `clickedNode` is one
of the two safe HTML node types.

- [ ] **Step 4: Run click-routing tests and verify they pass**

Run the Task 6 command. Expected: PASS.

- [ ] **Step 5: Commit link routing**

```bash
git add src/renderer/src/components/editor/rich-markdown-safe-html.ts src/renderer/src/components/editor/rich-markdown-editor-click-routing.ts src/renderer/src/components/editor/rich-markdown-editor-click-routing.test.ts
git commit -m "feat(markdown): route safe HTML links"
```

---

### Task 7: Round-Trip, Programmatic Sync, and Fork Documentation

**Files:**
- Modify: `src/renderer/src/components/editor/markdown-round-trip.test.ts`
- Modify: `src/renderer/src/components/editor/useRichMarkdownProgrammaticSync.test.ts`
- Modify: `FORK_NOTES.md`

**Interfaces:**
- Consumes the completed parser, transport, extensions, node views, and routing.
- Produces no new product API.

- [ ] **Step 1: Add failing end-to-end round-trip cases**

Add a table-driven test containing:

```ts
[
  'Before <A HREF=\"./Guide.md\" TITLE=\"A &amp; B\">Guide</A> after',
  '<span style=\"color:#fff; font-weight:700\">Text &copy;</span>',
  'First<br>Second<br/>Third<br />Fourth',
  '<h1 style=\"background-color: rgb(1 2 3)\">Title</h1>',
  '<p>Alpha\\n<span>Beta</span>\\nGamma</p>'
]
```

Assert open → `getMarkdown()` → reopen preserves each exact fragment. Add
unsafe/unknown counterparts and assert they continue to use raw nodes without
source loss.

- [ ] **Step 2: Add a failing programmatic-replacement test**

Open a safe `<span>`, externally replace content with a safe `<p>`, run
`useRichMarkdownProgrammaticSync`, and assert the editor contains the block safe
node and serializes the new exact source. Replace it again with an unsafe
`<iframe>` and assert raw fallback with exact source.

- [ ] **Step 3: Run integration tests and verify failures are meaningful**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/editor/markdown-round-trip.test.ts src/renderer/src/components/editor/useRichMarkdownProgrammaticSync.test.ts --pool=threads --maxWorkers=1
```

Expected before final fixes: at least the new programmatic or exact-source case
fails; no unrelated suite is run.

- [ ] **Step 4: Make the minimal integration fixes**

Adjust only safe-HTML preprocessing/extension reconciliation needed by these
tests. Do not change generic Markdown canonicalization or preview sanitization.

- [ ] **Step 5: Record the persistent fork customization**

Add under `FORK_NOTES.md` → `Persistent customizations`:

```md
- Rich Markdown renders and source-edits a bounded allowlist of safe inline HTML
  plus `<p>` and `<h1>`–`<h6>` blocks; unsupported HTML remains lossless raw
  source.
```

- [ ] **Step 6: Run the complete focused verification set**

Run:

```bash
PATH="/usr/local/opt/node@24/bin:$PATH" pnpm vitest run --config config/vitest.config.ts \
  src/renderer/src/components/editor/rich-markdown-safe-html-source.test.ts \
  src/renderer/src/components/editor/rich-markdown-safe-html-style.test.ts \
  src/renderer/src/components/editor/raw-markdown-html.test.ts \
  src/renderer/src/components/editor/rich-markdown-safe-html-dom.test.ts \
  src/renderer/src/components/editor/rich-markdown-safe-html.test.ts \
  src/renderer/src/components/editor/rich-markdown-safe-html-node-view.test.ts \
  src/renderer/src/components/editor/rich-markdown-editor-click-routing.test.ts \
  src/renderer/src/components/editor/markdown-round-trip.test.ts \
  src/renderer/src/components/editor/useRichMarkdownProgrammaticSync.test.ts \
  src/renderer/src/components/editor/rich-markdown-html-superscript-link.test.ts \
  src/renderer/src/components/editor/rich-markdown-link-shortcut.test.ts \
  config/scripts/check-root-directory-entries.test.mjs \
  --pool=threads --maxWorkers=1
```

Expected: all listed tests PASS.

- [ ] **Step 7: Check formatting and the exact diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only planned files plus the user's untracked
`.superpowers/` and `tests/test.md`.

- [ ] **Step 8: Commit integration and fork notes**

```bash
git add src/renderer/src/components/editor/markdown-round-trip.test.ts src/renderer/src/components/editor/useRichMarkdownProgrammaticSync.test.ts FORK_NOTES.md
git commit -m "docs: record safe rich markdown HTML"
```

Do not push until the user explicitly approves the finished implementation.
