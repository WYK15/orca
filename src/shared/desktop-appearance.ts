export type DesktopAppearance = {
  iconSize: number
  textSize: number
  density: 'compact' | 'standard' | 'spacious'
}

export const DEFAULT_DESKTOP_APPEARANCE: Readonly<DesktopAppearance> = {
  iconSize: 20,
  textSize: 13,
  density: 'standard'
}

export function normalizeDesktopAppearance(value: unknown): DesktopAppearance {
  const record = value && typeof value === 'object' ? (value as Partial<DesktopAppearance>) : {}
  return {
    iconSize: [16, 18, 20, 22, 24].includes(record.iconSize ?? 0) ? record.iconSize! : 20,
    textSize: [12, 13, 14, 15, 16].includes(record.textSize ?? 0) ? record.textSize! : 13,
    density:
      record.density === 'compact' || record.density === 'spacious' ? record.density : 'standard'
  }
}

export function desktopAppearanceVariables(value: unknown): Record<string, string> {
  const appearance = normalizeDesktopAppearance(value)
  return {
    '--desktop-icon-size': `${appearance.iconSize}px`,
    '--desktop-small-icon-size': `${appearance.iconSize - 4}px`,
    '--desktop-detail-icon-size': `${appearance.iconSize - 2}px`,
    '--desktop-control-size': `${Math.max(32, appearance.iconSize + 12)}px`,
    '--desktop-text-size': `${appearance.textSize}px`,
    '--desktop-row-padding': `${{ compact: 4, standard: 6, spacious: 8 }[appearance.density]}px`
  }
}
