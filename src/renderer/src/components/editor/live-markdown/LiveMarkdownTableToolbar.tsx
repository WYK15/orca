import type { JSX } from 'react'
import { MoreHorizontal, Plus, AlignLeft, AlignCenter, AlignRight, Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent
} from '@/components/ui/dropdown-menu'
import { LiveMarkdownTableMenu } from './LiveMarkdownTableMenu'
import type { TableStructureAction } from './table-source'

export function LiveMarkdownTableToolbar({
  onAction,
  revealSource,
  onMenuChange,
  restoreFocus
}: {
  onAction: (action: TableStructureAction) => void
  revealSource: () => void
  onMenuChange: (open: boolean) => void
  restoreFocus: (event: Event) => void
}): JSX.Element {
  return (
    <TooltipProvider>
      <div className="live-md-table-toolbar" onMouseDown={(event) => event.preventDefault()}>
        {(
          [
            ['row-after', '在下方插入行', Plus],
            ['align-left', '当前列左对齐', AlignLeft],
            ['align-center', '当前列居中对齐', AlignCenter],
            ['align-right', '当前列右对齐', AlignRight]
          ] as const
        ).map(([action, label, Icon]) => (
          <Tooltip key={action}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={label}
                onClick={() => onAction(action)}
              >
                <Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="编辑表格源码" onClick={revealSource}>
              <Code className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>编辑表格源码</TooltipContent>
        </Tooltip>
        <DropdownMenu onOpenChange={onMenuChange}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="表格操作">
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent onCloseAutoFocus={restoreFocus}>
            <LiveMarkdownTableMenu
              kind="dropdown"
              onAction={onAction}
              revealSource={revealSource}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  )
}
