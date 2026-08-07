import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { AiVaultScope, AiVaultSession } from '../../../../shared/ai-vault-types'
import type { AiVaultResumeStartup } from '@/lib/ai-vault-resume-command'
import { cn } from '@/lib/utils'
import { VaultGroupHeader } from './AiVaultPanelControls'
import { VaultSessionRow } from './AiVaultSessionRow'
import type { AiVaultListRow } from './AiVaultSessionVirtualList'
import type { AiVaultOriginalPaneTarget } from './ai-vault-original-pane'
import {
  aiVaultSessionResumeLabel,
  aiVaultSessionRowResumeGating,
  type AiVaultSessionResumeActions,
  type AiVaultSessionResumeState
} from './ai-vault-session-resume'
import { canContinueAiVaultSessionInNewSession } from './ai-vault-session-continuation'
import {
  canJumpToAiVaultSessionWorktree,
  isAiVaultSessionInCurrentWorktree,
  type AiVaultSessionWorktreeInfo
} from './ai-vault-session-worktree'
import {
  canOpenAiVaultSessionLogInOrca,
  canUseLocalAiVaultSessionPathActions
} from './ai-vault-session-path-actions'

export function AiVaultVirtualRow({
  row,
  index,
  start,
  activeStickyHeaderIndex,
  measureElement,
  collapsedGroups,
  expandedSessionIds,
  vaultScope,
  buildResumeStartup,
  getOriginalPaneTarget,
  getSessionLiveState,
  getWorktreeInfo,
  getSessionResumeState,
  getSessionResumeActions,
  onToggleGroup,
  onToggleSessionDetails,
  onJumpToOriginalPane,
  onJumpToWorktree,
  onResume,
  onContinueInNewSession,
  onCopyResume,
  onCopyId,
  onCopyPath,
  onOpenLog,
  onRevealLog,
  onOpenCwd,
  onRequestDelete,
  selectionMode,
  selectedSessionIds,
  onToggleSelection
}: {
  row: AiVaultListRow | undefined
  index: number
  start: number
  activeStickyHeaderIndex: number | null
  measureElement: (node: Element | null) => void
  collapsedGroups: ReadonlySet<string>
  expandedSessionIds: ReadonlySet<string>
  vaultScope: AiVaultScope
  buildResumeStartup: (session: AiVaultSession, worktreeId?: string | null) => AiVaultResumeStartup
  getOriginalPaneTarget: (session: AiVaultSession) => AiVaultOriginalPaneTarget | null
  getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
  getWorktreeInfo: (session: AiVaultSession) => AiVaultSessionWorktreeInfo | null
  getSessionResumeState: (session: AiVaultSession) => AiVaultSessionResumeState
  getSessionResumeActions: (session: AiVaultSession) => AiVaultSessionResumeActions
  onToggleGroup: (key: string) => void
  onToggleSessionDetails: (sessionId: string) => void
  onJumpToOriginalPane: (session: AiVaultSession) => void
  onJumpToWorktree: (worktreeId: string) => void
  onResume: (session: AiVaultSession, worktreeId: string) => void
  onContinueInNewSession: (session: AiVaultSession, worktreeId: string) => void
  onCopyResume: (session: AiVaultSession, worktreeId?: string | null) => void
  onCopyId: (session: AiVaultSession) => void
  onCopyPath: (session: AiVaultSession) => void
  onOpenLog: (session: AiVaultSession) => void
  onRevealLog: (session: AiVaultSession) => void
  onOpenCwd: (session: AiVaultSession) => void
  onRequestDelete: (session: AiVaultSession) => void
  selectionMode: boolean
  selectedSessionIds: ReadonlySet<string>
  onToggleSelection: (session: AiVaultSession) => void
}): React.JSX.Element | null {
  if (!row) {
    return null
  }
  const isActiveStickyHeader = row.type === 'group' && activeStickyHeaderIndex === index
  const originalPaneTarget = row.type === 'session' ? getOriginalPaneTarget(row.session) : null
  const worktreeInfo = row.type === 'session' ? getWorktreeInfo(row.session) : null
  const showJumpToWorktree = !isAiVaultSessionInCurrentWorktree(worktreeInfo)
  const worktreeJumpId =
    showJumpToWorktree && canJumpToAiVaultSessionWorktree(worktreeInfo)
      ? worktreeInfo?.worktreeId
      : null
  const resumeState = row.type === 'session' ? getSessionResumeState(row.session) : null
  const resumeActions = row.type === 'session' ? getSessionResumeActions(row.session) : null
  const continuationWorktreeId =
    row.type === 'session' &&
    canContinueAiVaultSessionInNewSession(row.session, resumeState?.worktreeId)
      ? resumeState?.worktreeId
      : null
  const resumeGating =
    row.type === 'session'
      ? aiVaultSessionRowResumeGating(row.session, resumeState)
      : { resumeDisabled: true, canCopyResumeCommand: false }
  const resumeLabel = resumeState ? aiVaultSessionResumeLabel(resumeState) : ''
  const canOpenLocalSessionPaths =
    row.type === 'session' && canUseLocalAiVaultSessionPathActions(row.session.executionHostId)
  const canOpenLogInOrca = row.type === 'session' && canOpenAiVaultSessionLogInOrca(row.session)

  return (
    <div
      ref={measureElement}
      data-index={index}
      className={cn(
        'left-0 w-full',
        isActiveStickyHeader ? 'sticky top-0 z-10 bg-sidebar' : 'absolute top-0'
      )}
      style={isActiveStickyHeader ? undefined : { transform: `translateY(${start}px)` }}
    >
      {row.type === 'group' ? (
        <VaultGroupHeader
          group={row.group}
          collapsed={collapsedGroups.has(row.group.key)}
          onToggle={() => onToggleGroup(row.group.key)}
        />
      ) : (
        <VaultSessionRow
          session={row.session}
          liveState={getSessionLiveState(row.session)}
          resumeStartup={buildResumeStartup(row.session, resumeState?.worktreeId)}
          realHomeResumeStartup={buildResumeStartup(
            { ...row.session, codexHome: null },
            resumeState?.worktreeId
          )}
          worktreeInfo={worktreeInfo}
          vaultScope={vaultScope}
          detailsExpanded={expandedSessionIds.has(row.session.id)}
          resumeDisabled={resumeGating.resumeDisabled}
          resumeLabel={resumeLabel}
          resumeActions={
            resumeActions ?? {
              worktree: { worktreeId: null, disabled: true },
              newTab: { worktreeId: null, disabled: true }
            }
          }
          onToggleDetails={() => onToggleSessionDetails(row.session.id)}
          onJumpToOriginalPane={
            originalPaneTarget ? () => onJumpToOriginalPane(row.session) : undefined
          }
          showJumpToWorktree={showJumpToWorktree}
          onJumpToWorktree={worktreeJumpId ? () => onJumpToWorktree(worktreeJumpId) : undefined}
          onResume={() => {
            if (resumeState?.worktreeId) {
              onResume(row.session, resumeState.worktreeId)
            }
          }}
          onContinueInNewSession={
            continuationWorktreeId
              ? () => onContinueInNewSession(row.session, continuationWorktreeId)
              : undefined
          }
          onResumeInWorktree={() => {
            if (resumeActions?.worktree.worktreeId) {
              onResume(row.session, resumeActions.worktree.worktreeId)
            }
          }}
          onResumeInNewTab={() => {
            if (resumeActions?.newTab.worktreeId) {
              onResume(row.session, resumeActions.newTab.worktreeId)
            }
          }}
          onCopyResume={
            resumeGating.canCopyResumeCommand
              ? () => onCopyResume(row.session, resumeState?.worktreeId)
              : undefined
          }
          onCopyId={() => onCopyId(row.session)}
          onCopyPath={() => onCopyPath(row.session)}
          onOpenLog={canOpenLogInOrca ? () => onOpenLog(row.session) : undefined}
          onRevealLog={canOpenLocalSessionPaths ? () => onRevealLog(row.session) : undefined}
          onOpenCwd={
            canOpenLocalSessionPaths && row.session.cwd ? () => onOpenCwd(row.session) : undefined
          }
          onRequestDelete={onRequestDelete}
          selectionMode={selectionMode}
          selected={selectedSessionIds.has(row.session.id)}
          onToggleSelection={onToggleSelection}
        />
      )}
    </div>
  )
}
