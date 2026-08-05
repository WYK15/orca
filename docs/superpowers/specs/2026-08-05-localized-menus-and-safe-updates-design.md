# Localized Menus and Safe Updates Design

## Goal

Fix the two reported Chinese menu defects and make update behavior truthful for unsigned fork packages.

## Rich Markdown Table Labels

The rich Markdown table toolbar already resolves its labels through i18next, but the Chinese catalog does not contain the six table-action keys. Add Chinese translations for inserting and deleting rows and columns. Keep the existing English keys and component structure unchanged.

The Chinese labels are:

- Insert row above: `在上方插入行`
- Insert row below: `在下方插入行`
- Delete current row: `删除当前行`
- Insert column left: `在左侧插入列`
- Insert column right: `在右侧插入列`
- Delete current column: `删除当前列`

## File Explorer Copy Labels

The file explorer exposes two different actions that currently share the Chinese label `复制`:

- Copying the selected file into the system clipboard.
- Creating a duplicate beside the selected file.

Translate the clipboard action as `复制文件` and the duplicate action as `创建副本`. Existing path actions remain `复制路径` and `复制相对路径`.

## Update Delivery Policy

Release discovery remains enabled on every packaged desktop platform and continues to read releases from `WYK15/orca`.

Each packaged application records whether its release artifacts support safe automatic installation:

- Linux fork packages: automatic delivery enabled.
- Unsigned macOS fork packages: manual delivery.
- Unsigned Windows fork packages: manual delivery.
- Signed release packages produced by a future signing workflow may explicitly enable automatic delivery.

The runtime reads packaged metadata rather than inferring safety from the operating system alone. Missing or malformed metadata fails closed to manual delivery on macOS and Windows. Linux remains automatic because the current Linux package recovery and installation paths do not depend on Apple Developer ID or Authenticode signatures.

The existing macOS-specific metadata remains readable during migration so already-built packages keep their current manual behavior.

## Settings Behavior

The Settings update section follows the delivery value returned by the main process:

- Automatic delivery shows `Install Update`, downloads the artifact, and later shows `Restart to Update`.
- Manual delivery shows `Open Download Page` and opens the exact versioned GitHub Release URL.

Manual delivery never calls the updater download IPC. The status text explains that the release must be downloaded and installed manually. The existing update card and Settings section use the same delivery semantics.

## Release Version Discovery

Versions such as `1.4.165-wyk.4` are SemVer prereleases. A running `wyk` build already includes prereleases when resolving newer tags, so a future `v1.4.165-wyk.5` release is discoverable. Release readiness checks continue to require the platform manifest and every artifact referenced by it before presenting the update.

## Testing

Add focused regression coverage for:

- Chinese rich Markdown table labels.
- Distinct Chinese file copy and duplicate labels.
- Packaged update-delivery metadata for unsigned fork packages.
- Fail-closed runtime delivery policy on macOS and Windows.
- Automatic Linux delivery.
- Settings manual-update button copy, exact Release URL, and absence of download IPC.
- Existing automatic Settings download behavior.

No layout, color, spacing, shortcut, SSH, folder-workspace, or Git behavior changes are included.
