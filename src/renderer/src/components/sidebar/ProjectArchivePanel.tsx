import { useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Folder, ListChecks, Loader2, Search, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSidebarProjectCatalog } from './use-sidebar-project-catalog'
import { openSidebarProject, setSidebarProjectsArchived } from './sidebar-project-archive-actions'
import type { SidebarProjectEntry } from '../../../../shared/sidebar-project-archive'
import { translate } from '@/i18n/i18n'

export function ProjectArchivePanel() {
  const entries = useSidebarProjectCatalog()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('archived')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const archived = entries.filter((entry) => entry.archivedAt !== null)
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return entries
      .filter(
        (entry) =>
          (tab === 'archived' ? entry.archivedAt !== null : entry.archivedAt === null) &&
          `${entry.name} ${entry.repos.map((repo) => repo.path).join(' ')}`
            .toLocaleLowerCase()
            .includes(term)
      )
      .sort((a, b) =>
        tab === 'archived'
          ? (b.archivedAt ?? 0) - (a.archivedAt ?? 0)
          : a.name.localeCompare(b.name)
      )
  }, [entries, tab, query])
  const selectedEntries = visible.filter((entry) => selected.includes(entry.id))
  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQuery('')
      setSelected([])
    }
  }
  const move = async (items: SidebarProjectEntry[]) => {
    setBusy(true)
    try {
      if (await setSidebarProjectsArchived(items, tab !== 'archived')) {
        setSelected([])
      }
    } finally {
      setBusy(false)
    }
  }
  const openEntry = async (entry: SidebarProjectEntry) => {
    setBusy(true)
    try {
      if (await openSidebarProject(entry)) {
        changeOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }
  const title = translate('fork.archive.title', 'Archive')
  return (
    <>
      <div className="flex shrink-0 items-center border-t border-worktree-sidebar-border px-2 py-1.5">
        <Button
          variant="ghost"
          className="flex-1 justify-start text-worktree-sidebar-foreground"
          onClick={() => {
            setTab('archived')
            setOpen(true)
          }}
        >
          <Archive className="size-4" />
          <span>{title}</span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {archived.length}
          </span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate('fork.archive.manage', 'Organize projects')}
              onClick={() => {
                setTab('active')
                setOpen(true)
              }}
            >
              <ListChecks className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{translate('fork.archive.manage', 'Organize projects')}</TooltipContent>
        </Tooltip>
      </div>
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent
          className="w-[min(600px,94vw)] sm:max-w-[600px]"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            searchRef.current?.focus()
          }}
        >
          <SheetHeader className="border-b border-border px-6 pt-7 pb-5">
            <SheetTitle className="flex items-center gap-2">
              <Archive className="size-5" />
              {title}
            </SheetTitle>
            <SheetDescription>
              {translate(
                'fork.archive.description',
                'Keep active projects focused. Archived files, configuration and running terminals are preserved.'
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-6 pt-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                className="pl-10"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={translate('fork.archive.search', 'Search projects')}
                placeholder={translate(
                  'fork.archive.searchPlaceholder',
                  'Search project names or paths…'
                )}
              />
            </div>
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setTab(value)
                setSelected([])
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="archived">
                  {title} · {archived.length}
                </TabsTrigger>
                <TabsTrigger value="active">
                  {translate('fork.archive.active', 'Active projects')} ·{' '}
                  {entries.length - archived.length}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex min-h-8 items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="xs"
                disabled={busy || !visible.length}
                onClick={() =>
                  setSelected(
                    selectedEntries.length === visible.length
                      ? []
                      : visible.map((entry) => entry.id)
                  )
                }
              >
                {selectedEntries.length === visible.length && visible.length
                  ? translate('fork.archive.deselect', 'Deselect all')
                  : translate('fork.archive.selectAll', 'Select results')}
              </Button>
              {selectedEntries.length > 0 && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void move(selectedEntries)
                  }}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : tab === 'archived' ? (
                    <ArchiveRestore className="size-3.5" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                  {tab === 'archived'
                    ? translate('fork.archive.restoreSelected', 'Restore selected ({{count}})', {
                        count: selectedEntries.length
                      })
                    : translate('fork.archive.archiveSelected', 'Archive selected ({{count}})', {
                        count: selectedEntries.length
                      })}
                </Button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 scrollbar-sleek">
            {visible.map((entry) => {
              const remote = entry.repos.every(
                (repo) =>
                  repo.connectionId || (repo.executionHostId && repo.executionHostId !== 'local')
              )
              const Icon = remote ? Server : Folder
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 border-b border-border/60 py-3 px-2"
                >
                  <Checkbox
                    checked={selected.includes(entry.id)}
                    disabled={busy}
                    aria-label={translate('fork.archive.selectProject', 'Select {{name}}', {
                      name: entry.name
                    })}
                    onCheckedChange={() =>
                      setSelected((ids) =>
                        ids.includes(entry.id)
                          ? ids.filter((id) => id !== entry.id)
                          : [...ids, entry.id]
                      )
                    }
                  />
                  <button
                    className="flex min-w-0 flex-1 items-start gap-3 text-left rounded-md focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                    onClick={() => {
                      void openEntry(entry)
                    }}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{entry.name}</span>
                      <span className="mt-1 block truncate text-[11px] font-mono text-muted-foreground">
                        {entry.repos[0].path}
                        {entry.repos.length > 1 ? ` · +${entry.repos.length - 1}` : ''}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={busy}
                    onClick={() => {
                      void move([entry])
                    }}
                  >
                    {tab === 'archived'
                      ? translate('fork.archive.restore', 'Restore')
                      : translate('fork.archive.archiveProject', 'Archive project')}
                  </Button>
                </div>
              )
            })}
            {!visible.length && (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
                <Archive className="size-8" />
                <p className="text-sm">
                  {query
                    ? translate('fork.archive.noResults', 'No matching projects.')
                    : tab === 'archived'
                      ? translate('fork.archive.empty', 'No archived projects yet.')
                      : translate('fork.archive.noActive', 'All projects are archived.')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    query ? setQuery('') : setTab(tab === 'archived' ? 'active' : 'archived')
                  }
                >
                  {query
                    ? translate('fork.archive.clearSearch', 'Clear search')
                    : translate('fork.archive.manage', 'Organize projects')}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
