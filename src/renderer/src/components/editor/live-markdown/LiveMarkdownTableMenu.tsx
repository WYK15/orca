import type { JSX } from 'react'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { TableStructureAction } from './table-source'

const rowActions = [
  ['row-before', '在上方插入行'],
  ['row-after', '在下方插入行'],
  ['delete-row', '删除当前行'],
  ['clear-row', '清空当前行']
] as const
const columnActions = [
  ['column-before', '在左侧插入列'],
  ['column-after', '在右侧插入列'],
  ['delete-column', '删除当前列'],
  ['clear-column', '清空当前列']
] as const
const alignActions = [
  ['align-left', '当前列左对齐'],
  ['align-center', '当前列居中对齐'],
  ['align-right', '当前列右对齐']
] as const

export function LiveMarkdownTableMenu({
  kind,
  onAction,
  revealSource
}: {
  kind: 'context' | 'dropdown'
  onAction: (action: TableStructureAction) => void
  revealSource: () => void
}): JSX.Element {
  const Item = kind === 'context' ? ContextMenuItem : DropdownMenuItem
  const Separator = kind === 'context' ? ContextMenuSeparator : DropdownMenuSeparator
  return (
    <>
      {[rowActions, columnActions, alignActions].map((actions, index) => (
        <div key={actions[0][0]} role="group">
          {index > 0 && <Separator />}
          {actions.map(([action, label]: readonly [TableStructureAction, string]) => (
            <Item key={action} onSelect={() => onAction(action)}>
              {label}
            </Item>
          ))}
        </div>
      ))}
      <Separator />
      <Item onSelect={revealSource}>编辑表格源码</Item>
      <Item onSelect={() => onAction('delete-table')}>删除表格</Item>
    </>
  )
}
