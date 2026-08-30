import { describe, expect, it } from 'vitest'
import zh from './locales/zh.json'

describe('Chinese menu action localization', () => {
  it('localizes rich Markdown table actions', () => {
    expect(zh.auto.components.editor.RichMarkdownTableControls).toMatchObject({
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

  it('distinguishes worktree hiding from project removal', () => {
    const sidebar = zh.auto.components.sidebar

    expect(sidebar.WorktreeContextMenu.hideWorktreeFromOrca).toBe('从 Orca 中隐藏工作树')
    expect(sidebar.WorktreeList.manageWorktreeVisibility).toBe('管理工作树可见性…')
    expect(sidebar.WorktreeList.removeProjectFromOrca).toBe('从 Orca 中移除项目…')
    expect(sidebar.ArchivedWorktreeRecoveryList.show).toBe('显示')
    expect(sidebar.worktreeHiddenState.undo).toBe('撤销')
    expect(sidebar.RemoveFolderDialog.title).toBe('从 Orca 中移除项目？')
    expect(sidebar.RemoveFolderDialog.confirm).toBe('从 Orca 中移除')
  })
})
