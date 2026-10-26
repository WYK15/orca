import { useState, type ComponentProps } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

export function MarkdownTableGrip({
  dragging,
  children,
  ...props
}: ComponentProps<typeof Button> & { dragging: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open && !dragging} onOpenChange={setOpen} delayDuration={400}>
      <TooltipTrigger asChild>
        <Button {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        点击选择，拖动可移动
      </TooltipContent>
    </Tooltip>
  )
}
