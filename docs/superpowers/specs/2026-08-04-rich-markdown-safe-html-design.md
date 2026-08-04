# Rich Markdown Safe HTML Rendering Design

## Goal

Render a restricted, safe subset of authored HTML in Orca's rich Markdown
editor while preserving the exact Markdown source. Unsupported, malformed, or
unsafe HTML remains visible through the existing raw HTML representation.

This recreates the useful editing behavior of applications such as Typora
without copying or depending on Typora code.

## Scope

The first version supports these inline elements:

- `<a>`
- `<span>`
- `<u>`
- `<mark>`
- `<sub>`
- `<sup>`
- `<kbd>`
- `<br>`, `<br/>`, and `<br />`

It also supports these block roots:

- `<p>`
- `<h1>` through `<h6>`

A block root may contain plain text and the supported inline elements. Inline
elements may nest within the configured depth limit. Markdown syntax inside an
HTML fragment remains plain text; the feature does not recursively parse
Markdown inside HTML.

Comments, custom elements, media, images, tables, forms, scripts, embedded
content, and arbitrary HTML are outside this scope. The existing specialized
`<details>` and superscript-link behavior remains unchanged and takes
precedence where it already applies.

## User Experience

Safe HTML renders by default in rich mode. For example:

```html
<a href="https://example.com">Example</a>
<p style="color: red">Important text</p>
First line<br>Second line
```

The editor shows a link, a styled paragraph, and a line break rather than the
literal tag text.

Selecting a rendered HTML node switches that atom into source editing:

- Inline HTML uses a single-line source input.
- Block HTML uses a multiline source field.
- Enter saves an inline edit.
- Enter saves a block edit; Shift+Enter inserts a newline.
- Losing focus saves either kind.
- Escape cancels and restores the source present when editing began.
- Enter and Escape have no commit or cancel effect during IME composition.

The editor stores the authored source rather than normalized HTML. If a user
opens and saves a document without editing an HTML node, its quoting,
whitespace, tag casing, entity spelling, and `<br>` spelling remain unchanged.
Valid edited source is also saved exactly as entered.

## Architecture

### Source Recognition

Add a bounded safe-HTML matcher before the generic raw inline and block HTML
matchers in `encodeRawMarkdownHtmlForRichEditor`.

The matcher recognizes one complete root fragment at the current source
position:

- An inline root is accepted outside fenced and inline code and cannot contain
  a newline.
- A block root starts at a Markdown line boundary, may span lines, and must
  contain only text and safe inline descendants.
- `<br>` is a complete inline root and accepts no attributes.

On success, the source transport carries the exact fragment using separate
safe-inline and safe-block transport kinds. On failure, preprocessing continues
to the existing raw HTML matcher. This ordering makes the new behavior additive
and preserves the current lossless fallback.

Transport payloads contain source only. The editor reparses and revalidates the
source whenever it creates, renders, edits, pastes, or programmatically updates
a node. It never trusts a previously derived tree or a private clipboard marker.

### Parser

Implement a small deterministic parser for this allowlist instead of using the
browser's HTML parser as the security boundary. It returns an immutable tree of
safe element and text nodes plus the exact source span.

The parser:

- Requires balanced, correctly nested tags and matching tag names.
- Treats element and attribute names case-insensitively for validation.
- Rejects duplicate attributes and duplicate style properties.
- Rejects comments, declarations, processing instructions, nulls, and control
  characters other than tab, carriage return, and newline in block content.
- Decodes character references only into the safe render tree; the stored
  source remains encoded exactly as authored.
- Does not perform error recovery or silently discard input.

The resource limits are:

- 16 KiB per inline fragment.
- 64 KiB per block fragment.
- Eight element levels including the root.

Parsing is a single bounded pass over the candidate. Exceeding any limit returns
an ordinary unsupported result and therefore uses the raw HTML fallback.

### Editor Nodes

Add two Tiptap atom nodes:

- A safe inline HTML node in the inline group.
- A safe block HTML node in the block group.

Each node stores only its exact `source` attribute. Shared parser, renderer,
editing, link-routing, and clipboard modules serve both nodes, while separate
node views keep inline and block layout behavior explicit.

The node views keep a local draft only while editing. A successful commit
replaces the node with the node kind produced by revalidating the draft:

- Valid safe inline source becomes a safe inline node.
- Valid safe block source becomes a safe block node.
- Unsupported, malformed, or unsafe source becomes the corresponding existing
  raw HTML node with the draft preserved exactly.

This deliberate fallback lets users enter any Markdown HTML without data loss
while ensuring that unsafe content never reaches the rendered DOM.

### Safe DOM Construction

The renderer recursively creates allowlisted DOM elements with
`document.createElement`, assigns text with `textContent`, and applies validated
attributes and style properties individually. It never uses `innerHTML`,
`insertAdjacentHTML`, JSX raw HTML injection, or an equivalent HTML string
sink.

The rendered DOM is derived solely from the current parser result. Source input
is displayed as text in normal React form controls and is never injected into
markup.

## Attributes and Styles

The attribute allowlist is:

- `<a>`: `href`, `title`, and `style`.
- Other paired elements: `style`.
- `<br>`: no attributes.

`class`, `id`, `data-*`, `target`, event attributes, and every unlisted
attribute make the fragment unsupported. This avoids hidden behavior and
prevents authored HTML from reaching Orca-specific selectors or state hooks.

Allowed link targets are:

- `http:` and `https:`
- `mailto:`
- `file:`
- Relative paths and URLs
- Fragment identifiers beginning with `#`

Empty targets and targets with `javascript:`, `data:`, or an unrecognized
explicit scheme are unsupported. Character-reference and whitespace
obfuscation is resolved before protocol classification.

The style allowlist is:

- `color`
- `background-color`
- `background` when its value is a single color
- `font-size`
- `font-weight`
- `font-style`
- `text-decoration`

Color values may use CSS named colors, `transparent`, `currentColor`, hex,
`rgb()`/`rgba()`, or `hsl()`/`hsla()` forms. `font-size` accepts 8–72 px,
0.5–4 em/rem, or 50–400%. Font weight accepts `normal`, `bold`, `bolder`,
`lighter`, or numeric hundreds from 100 through 900. Font style accepts
`normal`, `italic`, or `oblique`. Text decoration accepts `none` or a
space-separated combination of `underline`, `overline`, and `line-through`.

Style values containing `url()`, `var()`, CSS escapes, `!important`, or
unrecognized functions are unsupported. Positioning, layout, dimensions,
overflow, transforms, transitions, animations, generated content, and every
unlisted property are unsupported. Validation uses explicit grammars rather
than accepting whatever the browser CSS parser happens to retain.

Rendering uses the accepted authored values. The implementation does not add
new Orca design tokens because these styles are document content rather than
application chrome. The source editor and selection treatment continue to use
the existing tokens and primitives required by `docs/STYLEGUIDE.md`.

## Link Behavior

Rendered anchors do not navigate through native browser defaults. Activating a
link routes through Orca's existing Markdown link classification and opening
behavior so these cases continue to work:

- HTTP links honor Orca's in-app versus system-browser setting.
- File and relative links resolve from the Markdown document context.
- Hash links scroll within the current editor.
- Remote and SSH-backed documents retain their existing runtime context.

The gesture follows the current rich-editor link behavior, including Orca's
platform-aware modifier handling. The new node must not hardcode `metaKey`;
macOS uses Command and Linux/Windows use Control through the existing
cross-platform routing.

## Clipboard and Programmatic Updates

Copying a safe HTML node writes the exact Markdown source to plain text. Rich
clipboard data may include a private, versioned Orca marker so an internal paste
can reconstruct an atom, but the marker is only a hint. Paste reparses the
source and requires the rendered projection to agree with the marker before
creating a safe node.

Forged, stale, malformed, or mismatched private data falls back to normal paste
processing. External HTML clipboard content is not promoted merely because a
browser supplied markup.

When document content changes outside the node view, the local editor draft is
reconciled without overwriting an active composition. If the selected node is
removed or replaced, source editing closes cleanly rather than applying a stale
draft at a new position.

## Failure Behavior

Safety and parsing failures are ordinary compatibility outcomes, not document
errors:

- Opening existing unsafe or unknown HTML shows the exact source through the
  current raw HTML node.
- Committing an unsafe or malformed edit converts the atom to a raw HTML node
  and preserves the draft exactly.
- No failure deletes content, strips attributes, rewrites source, or partially
  renders a fragment.
- A renderer invariant failure shows the source as text and reports the error
  through the existing renderer error path; it never falls back to raw DOM
  injection.

Rich-mode eligibility continues to use the existing Markdown round-trip gate.
The new transports and nodes must serialize back to their exact source so safe
HTML does not force source mode and unsupported HTML retains current behavior.

## Compatibility

The feature runs in the renderer and introduces no native module, filesystem,
Git, or shell dependency. It must behave the same for local worktrees, folder
workspaces, WSL, and SSH-backed documents.

The change remains isolated from Markdown preview. Preview already uses
`rehype-raw` followed by `rehype-sanitize`; this design strengthens rich editing
without broadening preview's schema.

## Tests

Add focused tests for:

- Every supported inline and block tag, safe nesting, entities, and all three
  accepted `<br>` spellings.
- Exact source round trips for whitespace, casing, quote style, entities, and
  multiline block fragments.
- Rejection of unknown tags, invalid nesting, comments, duplicate attributes,
  duplicate style properties, forbidden attributes, and malformed syntax.
- Link protocol decoding and rejection of obfuscated or unsafe schemes.
- Every allowed style grammar and rejection of URLs, variables, escapes,
  `!important`, layout, positioning, animation, and out-of-range sizes.
- Inline and block byte limits, nesting limits, deterministic termination, and
  linear scan statistics on adversarial input.
- Safe DOM construction, including the absence of HTML string sinks, event
  properties, forbidden attributes, and unexpected elements.
- Node selection, source editing, Enter, Shift+Enter, blur, Escape, IME
  composition, stale-position handling, and programmatic source updates.
- Unsafe edits falling back losslessly to raw inline or block HTML nodes.
- HTTP, relative, file, hash, remote-runtime, and platform-aware link routing.
- Plain-text clipboard source, valid internal round trips, and forged or stale
  marker rejection.
- Rich-mode eligibility and opening, editing, saving, and reopening exact
  Markdown source.

Run only the focused rich-Markdown tests and the root-directory guard during
implementation, consistent with the request to avoid unrelated slow suites.

## Fork Maintenance

Treat safe rich-mode HTML rendering as a persistent downstream customization.
Record it in `FORK_NOTES.md` when implementation lands. Keep parsing, safe DOM
projection, node views, and editor integration in focused modules and commits
so upstream equivalents can replace them independently.
