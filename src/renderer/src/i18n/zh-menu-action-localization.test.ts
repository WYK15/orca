import { describe, expect, it } from 'vitest'
import zh from './locales/zh.json'

describe('Chinese menu action localization', () => {
  it('localizes rich Markdown table actions', () => {
    expect(zh.auto.components.editor.RichMarkdownTableToolbar).toEqual({
      insertRowAbove: '在上方插入行',
      insertRowBelow: '在下方插入行',
      deleteRow: '删除当前行',
      insertColumnLeft: '在左侧插入列',
      insertColumnRight: '在右侧插入列',
      deleteColumn: '删除当前列'
    })
  })

  it('distinguishes clipboard copy from duplicate', () => {
    const labels = zh.auto.components.right.sidebar.FileExplorerRow

    expect(labels['98a79948b3']).toBe('复制文件')
    expect(labels['0fec99bfd7']).toBe('创建副本')
    expect(labels['b5d436aa30']).toBe('复制路径')
    expect(labels['66a29dde82']).toBe('复制相对路径')
  })
})
