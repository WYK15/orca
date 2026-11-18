import { useState } from 'react'
import { Folders } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProjectGroupNameDialog } from './ProjectGroupNameDialog'

export function CreateSidebarProjectGroupButton() {
  const [open, setOpen] = useState(false)
  const title = translate('fork.groups.create', 'New group')
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={title}
            onClick={() => setOpen(true)}
          >
            <Folders className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {title}
        </TooltipContent>
      </Tooltip>
      <ProjectGroupNameDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={translate(
          'fork.groups.description',
          'Organize projects in a collapsible group.'
        )}
        initialName=""
        confirmLabel={translate('fork.groups.createAction', 'Create')}
        onSubmit={async (name) => {
          const group = await useAppStore.getState().createProjectGroup(name)
          if (!group) {
            const message = translate('fork.groups.createFailed', 'Could not create the group.')
            toast.error(message)
            throw new Error(message)
          }
          const state = useAppStore.getState()
          if (state.groupBy !== 'repo') {
            state.setGroupBy('repo')
          }
          state.revealSidebarRow(`project-group:${group.id}`)
        }}
      />
    </>
  )
}
