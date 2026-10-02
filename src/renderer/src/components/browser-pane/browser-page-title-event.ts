export function resolveBrowserPageTitleEvent(
  eventTitle: string | undefined,
  readCurrentTitle: () => string
): string | undefined {
  try {
    return readCurrentTitle() || eventTitle
  } catch {
    return eventTitle
  }
}
