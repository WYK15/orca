import type { JSX } from 'react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent
} from '@/components/ui/context-menu'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
} from '@/components/ui/dropdown-menu'
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
  revealSource,
  onSelectGroup
}: {
  kind: 'context' | 'dropdown'
  onAction: (action: TableStructureAction) => void
  revealSource: () => void
  onSelectGroup: (kind: 'row' | 'column' | 'table') => void
}): JSX.Element {
  const Item = kind === 'context' ? ContextMenuItem : DropdownMenuItem
  const Separator = kind === 'context' ? ContextMenuSeparator : DropdownMenuSeparator
  const Sub = kind === 'context' ? ContextMenuSub : DropdownMenuSub
  const SubTrigger = kind === 'context' ? ContextMenuSubTrigger : DropdownMenuSubTrigger
  const SubContent = kind === 'context' ? ContextMenuSubContent : DropdownMenuSubContent
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
      <Sub>
        <SubTrigger>选择单元格</SubTrigger>
        <SubContent>
          {(
            [
              ['row', '选择当前行'],
              ['column', '选择当前列'],
              ['table', '选择整个表格']
            ] as const
          ).map(([value, label]) => (
            <Item key={value} onSelect={() => onSelectGroup(value)}>
              {label}
            </Item>
          ))}
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger>移动行或列</SubTrigger>
        <SubContent>
          {(
            [
              ['move-row-up', '当前行上移'],
              ['move-row-down', '当前行下移'],
              ['move-column-left', '当前列左移'],
              ['move-column-right', '当前列右移']
            ] as const
          ).map(([value, label]) => (
            <Item key={value} onSelect={() => onAction(value)}>
              {label}
            </Item>
          ))}
        </SubContent>
      </Sub>
      <Item onSelect={revealSource}>编辑表格源码</Item>
      <Item onSelect={() => onAction('delete-table')}>删除表格</Item>
    </>
  )
}
