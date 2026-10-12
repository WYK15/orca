import { describe, expect, it } from 'vitest'
import {
  applyMarkdownTableCellEdits,
  preserveMarkdownTableSourcePadding
} from './rich-markdown-table-source-edits'

describe('Markdown table source edits', () => {
  const source = '| Key | Value |\n| --- | --- |\n| setting | old |'
  const base = '| Key     | Value |\n| ------- | ----- |\n| setting | old   |'
  const edited =
    '| Key     | Value             |\n| ------- | ----------------- |\n| setting | longer new value  |'

  it('transfers cell edits while retaining each source row’s padding', () => {
    const result = applyMarkdownTableCellEdits(source, base, edited)
    expect(result.source).toBe(source.replace('old', 'longer new value'))
    expect(result.base).toBe(base.replace('old', 'longer new value'))
    expect(preserveMarkdownTableSourcePadding(result.base, edited)).toBe(result.base)
  })

  it('retains alignment changes while ignoring delimiter width', () => {
    expect(
      preserveMarkdownTableSourcePadding(source, source.replace('--- |', ':---- |'))
    ).toContain(':---- |')
  })

  it('leaves changed table shapes for normal reconciliation', () => {
    const withRow = `${edited}\n| extra | row |`
    expect(applyMarkdownTableCellEdits(source, base, withRow)).toEqual({ source, base })
    expect(preserveMarkdownTableSourcePadding(base, withRow)).toBe(withRow)
    expect(applyMarkdownTableCellEdits(source, base, '')).toEqual({ source, base })
  })

  it('does not transfer cells whose source markup differs from canonical markup', () => {
    const original = source.replace('old', '_old_')
    const canonical = base.replace('old', '*old*')
    expect(applyMarkdownTableCellEdits(original, canonical, edited)).toEqual({
      source: original,
      base: canonical
    })
  })

  it('handles escaped pipes inside cells', () => {
    const original = source.replace('old', 'a\\|b')
    const canonical = base.replace('old', 'a\\|b')
    expect(applyMarkdownTableCellEdits(original, canonical, edited).source).toBe(
      source.replace('old', 'longer new value')
    )
  })

  it('ignores table-like text inside code fences', () => {
    for (const marker of ['```', '~~~~']) {
      const wrap = (text: string): string => `${marker}text\n${text}\n${marker}`
      expect(applyMarkdownTableCellEdits(wrap(source), wrap(base), wrap(edited))).toEqual({
        source: wrap(source),
        base: wrap(base)
      })
      expect(preserveMarkdownTableSourcePadding(wrap(base), wrap(edited))).toBe(wrap(edited))
    }
  })
})
