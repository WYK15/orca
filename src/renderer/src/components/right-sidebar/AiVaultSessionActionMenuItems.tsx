import {
  Copy,
  FileJson,
  FolderOpen,
  LocateFixed,
  MessageSquarePlus,
  PanelTopOpen,
  Play,
  Trash2
} from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { AiVaultAgent } from '../../../../shared/ai-vault-types'
import type { AiVaultSessionDeletabilityResult } from './ai-vault-session-deletability'
import { aiVaultSessionDeleteReasonText } from './ai-vault-session-delete-reason'

export function SessionActionMenuItems({
  menuKind = 'dropdown',
  resumeDisabled,
  resumeLabel,
  onResume,
  onContinueInNewSession,
  onJumpToOriginalPane,
  showJumpToWorktree,
  onJumpToWorktree,
  onCopyResume,
  onCopyId,
  onCopyPath,
  onOpenLog,
  onRevealLog,
  onOpenCwd,
  agent,
  deletability,
  onDelete
}: {
  menuKind?: 'dropdown' | 'context'
  resumeDisabled: boolean
  resumeLabel: string
  onResume: () => void
  onContinueInNewSession?: () => void
  onJumpToOriginalPane?: () => void
  showJumpToWorktree: boolean
  onJumpToWorktree?: () => void
  // Absent for zero-turn sessions: copying a resume command that lands in an
  // empty conversation would contradict the "not saved" state.
  onCopyResume?: () => void
  onCopyId: () => void
  onCopyPath: () => void
  onOpenLog?: () => void
  onRevealLog?: () => void
  onOpenCwd?: () => void
  agent: AiVaultAgent
  deletability: AiVaultSessionDeletabilityResult
  onDelete: () => void
}) {
  const Item = menuKind === 'context' ? ContextMenuItem : DropdownMenuItem
  const Separator = menuKind === 'context' ? ContextMenuSeparator : DropdownMenuSeparator
  const hasLocalPathActions = Boolean(onOpenLog || onRevealLog || onOpenCwd)
  const deleteLabel = translate('auto.components.right.sidebar.AiVaultSessionRow.delete', 'Delete')
  // Reason is shown both visually (tooltip below) and to assistive tech
  // (aria-label), so a keyboard/screen-reader user hears WHY Delete is disabled,
  // not just that it is.
  const deleteReasonText = deletability.deletable
    ? undefined
    : aiVaultSessionDeleteReasonText(deletability, agent)
  const deleteItem = (
    <Item
      variant="destructive"
      disabled={!deletability.deletable}
      onSelect={deletability.deletable ? onDelete : undefined}
      aria-label={deleteReasonText ? `${deleteLabel}. ${deleteReasonText}` : undefined}
    >
      <Trash2 className="size-3.5" />
      {deleteLabel}
    </Item>
  )

  return (
    <>
      {onJumpToOriginalPane ? (
        <Item onSelect={onJumpToOriginalPane}>
          <LocateFixed className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.AiVaultSessionRow.jumpToOriginalPane',
            'Jump to Original Pane'
          )}
        </Item>
      ) : null}
      {showJumpToWorktree ? (
        <Item disabled={!onJumpToWorktree} onSelect={onJumpToWorktree}>
          <PanelTopOpen className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.AiVaultSessionRow.jumpToWorktree',
            'Jump to Worktree'
          )}
        </Item>
      ) : null}
      <Item disabled={resumeDisabled} onSelect={onResume}>
        <Play className="size-3.5" />
        {resumeLabel}
      </Item>
      {onContinueInNewSession ? (
        <Item onSelect={onContinueInNewSession}>
          <MessageSquarePlus className="size-3.5" />
          {translate(
            'components.agentSessionContinuation.continueInNewSession',
            'Continue in New Session…'
          )}
        </Item>
      ) : null}
      {onCopyResume ? (
        <Item onSelect={onCopyResume}>
          <Copy className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.AiVaultSessionRow.copyResumeCommand',
            'Copy Resume Command'
          )}
        </Item>
      ) : null}
      {hasLocalPathActions ? (
        <>
          <Separator />
          {onOpenLog ? (
            <Item onSelect={onOpenLog}>
              <FileJson className="size-3.5" />
              {translate('auto.components.right.sidebar.AiVaultSessionRow.openLog', 'Open Log')}
            </Item>
          ) : null}
          {onRevealLog ? (
            <Item onSelect={onRevealLog}>
              <FolderOpen className="size-3.5" />
              {translate('auto.components.right.sidebar.AiVaultSessionRow.revealLog', 'Reveal Log')}
            </Item>
          ) : null}
          {onOpenCwd ? (
            <Item onSelect={onOpenCwd}>
              <FolderOpen className="size-3.5" />
              {translate(
                'auto.components.right.sidebar.AiVaultSessionRow.openWorkingDirectory',
                'Open Working Directory'
              )}
            </Item>
          ) : null}
        </>
      ) : null}
      <Separator />
      <Item onSelect={onCopyId}>
        {translate(
          'auto.components.right.sidebar.AiVaultSessionRow.copySessionId',
          'Copy Session ID'
        )}
      </Item>
      <Item onSelect={onCopyPath}>
        {translate('auto.components.right.sidebar.AiVaultSessionRow.copyLogPath', 'Copy Log Path')}
      </Item>
      <Separator />
      {deletability.deletable ? (
        deleteItem
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Why: a disabled item is pointer-events:none, so the tooltip
               trigger needs this wrapping div to still receive hover (mirrors
               the "Delete Worktree" disabled pattern in WorktreeContextMenu). */}
            <div>{deleteItem}</div>
          </TooltipTrigger>
          <TooltipContent
            side={menuKind === 'context' ? 'right' : 'left'}
            sideOffset={8}
            className="max-w-72"
          >
            {deleteReasonText}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  )
}
