import { describe, expect, it } from 'vitest'
import { desktopAppearanceVariables, normalizeDesktopAppearance } from './desktop-appearance'

describe('desktop appearance preferences', () => {
  it('normalizes legacy, invalid and partially saved preferences', () => {
    expect(normalizeDesktopAppearance(undefined)).toEqual({
      iconSize: 20,
      textSize: 13,
      density: 'standard'
    })
    expect(
      normalizeDesktopAppearance({ iconSize: Infinity, textSize: '16', density: 'wrong' })
    ).toEqual({ iconSize: 20, textSize: 13, density: 'standard' })
    expect(normalizeDesktopAppearance({ iconSize: 24 })).toEqual({
      iconSize: 24,
      textSize: 13,
      density: 'standard'
    })
  })
  it('keeps hit targets large while allowing compact icons and independent density', () => {
    expect(
      desktopAppearanceVariables({ iconSize: 16, textSize: 14, density: 'spacious' })
    ).toMatchObject({
      '--desktop-icon-size': '16px',
      '--desktop-control-size': '32px',
      '--desktop-row-padding': '8px',
      '--desktop-text-size': '14px'
    })
    expect(desktopAppearanceVariables({ iconSize: 24, density: 'compact' })).toMatchObject({
      '--desktop-icon-size': '24px',
      '--desktop-control-size': '36px',
      '--desktop-row-padding': '4px'
    })
  })
})
