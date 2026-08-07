import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { AiVaultScope, AiVaultSession } from '../../../../shared/ai-vault-types'
import type { AiVaultResumeStartup } from '@/lib/ai-vault-resume-command'
import { translate } from '@/i18n/i18n'
import { getActiveStickyHeaderIndexForScroll } from '../sidebar/worktree-list-virtual-rows'
import { EmptyState, SessionLoadingState } from './AiVaultPanelControls'
import type { AiVaultSessionGroup } from './ai-vault-session-filters'
import type { AiVaultOriginalPaneTarget } from './ai-vault-original-pane'
import type {
  AiVaultSessionResumeActions,
  AiVaultSessionResumeState
} from './ai-vault-session-resume'
import type { AiVaultSessionWorktreeInfo } from './ai-vault-session-worktree'
import {
  extractVaultVirtualRowIndexes,
  getVaultStickyHeaderIndexes,
  VAULT_GROUP_HEADER_ROW_HEIGHT,
  VAULT_SESSION_ROW_HEIGHT
} from './ai-vault-virtual-rows'
import { AiVaultVirtualRow } from './AiVaultVirtualRow'

const VAULT_ROW_OVERSCAN = 8
const VAULT_EXPANDED_SESSION_ROW_ESTIMATED_HEIGHT = 420

export type AiVaultListRow =
  | { type: 'group'; group: AiVaultSessionGroup }
  | { type: 'session'; groupKey: string; session: AiVaultSession }

type AiVaultSessionVirtualListProps = {
  groups: readonly AiVaultSessionGroup[]
  collapsedGroups: ReadonlySet<string>
  loading: boolean
  sessionsCount: number
  filteredSessionsCount: number
  noAgentsSelected: boolean
  error: string | null
  vaultScope: AiVaultScope
  buildResumeStartup: (session: AiVaultSession, worktreeId?: string | null) => AiVaultResumeStartup
  getOriginalPaneTarget: (session: AiVaultSession) => AiVaultOriginalPaneTarget | null
  getSessionLiveState: (session: AiVaultSession) => AgentStatusState | null
  getWorktreeInfo: (session: AiVaultSession) => AiVaultSessionWorktreeInfo | null
  getSessionResumeState: (session: AiVaultSession) => AiVaultSessionResumeState
  getSessionResumeActions: (session: AiVaultSession) => AiVaultSessionResumeActions
  onToggleGroup: (key: string) => void
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
}

export function AiVaultSessionVirtualList(
  props: AiVaultSessionVirtualListProps
): React.JSX.Element {
  const {
    groups,
    collapsedGroups,
    loading,
    sessionsCount,
    filteredSessionsCount,
    noAgentsSelected,
    error
  } = props
  const listScrollRef = useRef<HTMLDivElement>(null)
  const stickyRangeStartIndexRef = useRef(0)
  const activeStickyHeaderIndexRef = useRef<number | null>(null)
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(() => new Set())
  const vaultRows = useMemo(
    () => buildVaultRows(groups, collapsedGroups),
    [collapsedGroups, groups]
  )
  const stickyHeaderIndexes = useMemo(() => getVaultStickyHeaderIndexes(vaultRows), [vaultRows])
  const virtualizer = useVirtualizer({
    count: vaultRows.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: (index) => estimateVaultRowSize(vaultRows[index], expandedSessionIds),
    overscan: VAULT_ROW_OVERSCAN,
    rangeExtractor: useCallback(
      (range) => {
        stickyRangeStartIndexRef.current = range.startIndex
        return extractVaultVirtualRowIndexes({ range, stickyHeaderIndexes })
      },
      [stickyHeaderIndexes]
    ),
    getItemKey: (index) => vaultRowKey(vaultRows[index], index)
  })
  const toggleSessionDetails = useCallback((sessionId: string) => {
    setExpandedSessionIds((current) => toggleSetValue(current, sessionId))
  }, [])
  const virtualItems = virtualizer.getVirtualItems()
  activeStickyHeaderIndexRef.current = getActiveStickyHeaderIndexForScroll({
    rangeStartIndex: stickyRangeStartIndexRef.current,
    scrollOffset: virtualizer.scrollOffset ?? 0,
    stickyHeaderIndexes,
    virtualItems
  })

  return (
    <div
      ref={listScrollRef}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-sleek"
    >
      {loading && sessionsCount === 0 ? <SessionLoadingState /> : null}
      {!loading && sessionsCount === 0 && !error ? <EmptyState title={emptyVaultTitle()} /> : null}
      {sessionsCount > 0 && filteredSessionsCount === 0 ? (
        <EmptyState title={filteredEmptyVaultTitle(noAgentsSelected)} />
      ) : null}
      {vaultRows.length > 0 ? (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((virtualRow) => (
            <AiVaultVirtualRow
              key={virtualRow.key}
              row={vaultRows[virtualRow.index]}
              index={virtualRow.index}
              start={virtualRow.start}
              activeStickyHeaderIndex={activeStickyHeaderIndexRef.current}
              measureElement={virtualizer.measureElement}
              expandedSessionIds={expandedSessionIds}
              onToggleSessionDetails={toggleSessionDetails}
              {...props}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function buildVaultRows(
  groups: readonly AiVaultSessionGroup[],
  collapsedGroups: ReadonlySet<string>
): AiVaultListRow[] {
  return groups.flatMap((group) => [
    { type: 'group' as const, group },
    ...(collapsedGroups.has(group.key)
      ? []
      : group.sessions.map((session) => ({
          type: 'session' as const,
          groupKey: group.key,
          session
        })))
  ])
}

function estimateVaultRowSize(
  row: AiVaultListRow | undefined,
  expandedSessionIds: ReadonlySet<string>
): number {
  if (row?.type === 'group') {
    return VAULT_GROUP_HEADER_ROW_HEIGHT
  }
  return row?.type === 'session' && expandedSessionIds.has(row.session.id)
    ? VAULT_EXPANDED_SESSION_ROW_ESTIMATED_HEIGHT
    : VAULT_SESSION_ROW_HEIGHT
}

function vaultRowKey(row: AiVaultListRow | undefined, index: number): string {
  if (!row) {
    return `missing:${index}`
  }
  return row.type === 'group' ? `group:${row.group.key}` : `session:${row.session.id}`
}

function toggleSetValue(current: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}

function emptyVaultTitle(): string {
  return translate(
    'auto.components.right.sidebar.AiVaultPanel.noAgentSessionsFound',
    'No agent sessions found'
  )
}

function filteredEmptyVaultTitle(noAgentsSelected: boolean): string {
  return noAgentsSelected
    ? translate('auto.components.right.sidebar.AiVaultPanel.noAgentsSelected', 'No agents selected')
    : translate(
        'auto.components.right.sidebar.AiVaultPanel.noSessionsMatchFilters',
        'No sessions match the current filters'
      )
}
