export type HardWrappedPathFragmentRow = {
  text: string
  sourceText: string
  columns: number[]
  isWrapped: boolean
  lineLength: number
}

const PATH_FRAGMENT_CHARS = String.raw`[\p{L}\p{M}\p{N}._~@%+=:,/\\-]`
const PATH_FRAGMENT_PATTERN = new RegExp(`^${PATH_FRAGMENT_CHARS}+$`, 'u')
const PATH_FRAGMENT_PREFIX = new RegExp(`^${PATH_FRAGMENT_CHARS}+`, 'u')
const PATH_FRAGMENT_SUFFIX = new RegExp(`(?<!${PATH_FRAGMENT_CHARS})${PATH_FRAGMENT_CHARS}+$`, 'u')
const PATH_START_AFTER_PROSE = new RegExp(
  String.raw`(?:^|[\s•*>-])(?:/|\.{1,2}/|[\p{L}\p{M}\p{N}._-]+/)${PATH_FRAGMENT_CHARS}*$`,
  'u'
)

export function isHardWrappedPathFragment(text: string): boolean {
  return PATH_FRAGMENT_PATTERN.test(text) && /[\p{L}\p{N}]/u.test(text)
}

export function isIncompleteHardWrappedPathStart(text: string): boolean {
  // Why: a terminal row can end immediately after a complete root, drive, or
  // relative prefix, before the continuation contributes path-name characters.
  return /^(?:[/\\]|\.{1,2}\/|~\/|[A-Za-z]:)$/.test(text)
}

export function isHardWrappedPathContinuation(text: string): boolean {
  return isHardWrappedPathFragment(text) || isIncompleteHardWrappedPathStart(text)
}

export function canStartHardWrappedPath(text: string): boolean {
  if (!isHardWrappedPathFragment(text)) {
    return PATH_START_AFTER_PROSE.test(text)
  }

  return /(?:\/|\\)/.test(text)
}

function sliceHardWrappedPathFragmentRow(
  row: HardWrappedPathFragmentRow,
  startIndex: number,
  endIndex: number
): HardWrappedPathFragmentRow {
  return {
    ...row,
    text: row.text.slice(startIndex, endIndex),
    columns: row.columns.slice(startIndex, endIndex + 1)
  }
}

export function getHardWrappedPathSuffix(
  row: HardWrappedPathFragmentRow
): HardWrappedPathFragmentRow | null {
  const startIndex = PATH_FRAGMENT_SUFFIX.exec(row.text)?.index ?? row.text.length
  const suffix = sliceHardWrappedPathFragmentRow(row, startIndex, row.text.length)
  return isHardWrappedPathContinuation(suffix.text) ? suffix : null
}

export function getHardWrappedPathPrefix(
  row: HardWrappedPathFragmentRow
): HardWrappedPathFragmentRow | null {
  const endIndex = PATH_FRAGMENT_PREFIX.exec(row.text)?.[0].length ?? 0
  const prefix = sliceHardWrappedPathFragmentRow(row, 0, endIndex)
  return isHardWrappedPathContinuation(prefix.text) ? prefix : null
}
