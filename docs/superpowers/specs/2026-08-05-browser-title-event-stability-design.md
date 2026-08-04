# Browser Title Event Stability Design

## Goal

Prevent browser-tab labels and neighboring tabs from shifting when an embedded
page emits transient `page-title-updated` values that no longer match the
WebView's current title.

## Confirmed Cause

Pi Web emits alternating title events such as `⠋ π - pi-web` and
`pi-kit - Pi Web` while a task runs. At each event callback,
`webview.getTitle()` and the guest's `document.title` both remain
`pi-kit - Pi Web`.

`BrowserPane` currently writes the event payload directly into browser page
state and history. The transient label changes the tab strip's intrinsic width,
so every flexible tab is redistributed between approximately 194.54px and
192.25px.

## Considered Approaches

### Use the current WebView title

Treat `page-title-updated` as a notification and read `webview.getTitle()` as
the current source of truth. Fall back to the event payload only when the
WebView has no readable title.

This is the selected approach because it fixes the stale-data boundary without
changing layout or suppressing legitimate current titles.

### Debounce title events

Waiting briefly before applying a title would hide rapid churn, but it adds
latency to every browser title and still depends on timing. Slow transient
updates could remain visible.

### Stabilize widths or filter Pi titles

Fixed widths would mask the label churn without fixing browser state or
history. Filtering Pi-specific patterns would couple the browser to one page
and could suppress legitimate titles.

## Design

Add a small browser-title event resolver that receives the event title and a
current-title reader. It returns the current WebView title when available,
falls back to the event title when the current title is empty, and also falls
back when the WebView getter is temporarily unavailable.

`BrowserPane` will pass the resolved value through its existing browser display
title normalization. The same resolved title will update browser page state
and browser history, keeping both stores consistent.

No CSS, tab width rules, page scripts, Pi-specific patterns, or remote-browser
behavior will change.

## Testing

Add focused unit coverage for:

- a transient event title losing to a stable current WebView title;
- an empty current title falling back to the event payload;
- a temporarily unavailable current-title getter falling back safely.

Run the focused resolver test, existing browser-pane/browser-tab tests, changed
file lint or type checks, and `git diff --check`.

