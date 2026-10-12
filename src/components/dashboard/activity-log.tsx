import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SearchXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityActorSummary,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityPage,
  type ActivityScope,
  buildActivitySearchQuery,
  formatPaginationSummary,
  formatRangeLabel,
  hasActiveActivityFilters,
  initialsOf,
  parseActivityResponse,
  parseActorResponse,
  resolveTargetHref,
  resolveTargetPresentation,
} from './activity-query';
import ActivityRunDialog from './activity-run-dialog';
import { requestJson, toErrorMessage } from './api-client';

const ACTIVITY_ENDPOINT = '/api/dashboard/activity';
const ACTORS_ENDPOINT = '/api/dashboard/actors';
const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = ACTIVITY_PAGE_SIZE;
const SEARCH_MAX_LENGTH = 120;
const SKELETON_ROWS = ['activity-row-1', 'activity-row-2', 'activity-row-3', 'activity-row-4'];

const SCOPE_OPTIONS: { value: ActivityScope; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'user', label: 'Users only' },
  { value: 'agent', label: 'Agents only' },
];

const EMPTY_FILTERS: ActivityFilters = {
  scope: 'all',
  actorId: '',
  action: '',
  targetType: '',
  search: '',
  since: '',
  until: '',
};

const TARGET_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'post', label: 'Post' },
  { value: 'page', label: 'Page' },
  { value: 'category', label: 'Category' },
  { value: 'agent', label: 'Agent' },
  { value: 'redirect', label: 'Redirect' },
  { value: 'affiliate_product', label: 'Product' },
  { value: 'affiliate_program', label: 'Program' },
  { value: 'topic', label: 'Topic' },
  { value: 'source', label: 'Source' },
  { value: 'share_channel', label: 'Channel' },
  { value: 'share_job', label: 'Share job' },
  { value: 'media', label: 'Media' },
];

interface ActorOption {
  value: string;
  label: string;
}

function ActivityRowSkeleton() {
  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-40" />
    </li>
  );
}

interface ActivityRowProps {
  entry: ActivityEntry;
  now: number | null;
  onOpenRun: (entry: ActivityEntry) => void;
}

function ActivityRow({ entry, now, onOpenRun }: ActivityRowProps) {
  const target = resolveTargetPresentation(entry.targetType);
  const targetHref = resolveTargetHref(entry.targetType, entry.targetId);

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium',
            entry.actorType === 'agent'
              ? 'bg-chart-1/15 text-chart-1'
              : 'bg-chart-2/15 text-chart-2',
          )}
          aria-hidden="true"
        >
          {initialsOf(entry.actorLabel)}
        </span>
        <span className="truncate text-sm font-medium text-foreground">{entry.actorLabel}</span>
        <span className="text-xs text-muted-foreground">
          {entry.actorType === 'agent' ? 'Agent' : 'User'}
        </span>
        <Badge variant="outline" className="font-mono text-[0.6875rem] text-muted-foreground">
          {entry.action}
        </Badge>
        <time
          className="ml-auto text-xs tabular-nums text-muted-foreground"
          dateTime={entry.createdAt}
          title={entry.createdAt}
        >
          {now === null ? '' : formatRelativeTime(entry.createdAt, now)}
        </time>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{entry.summary}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tracking-[0.06em] uppercase">{target.label}</span>
        {entry.targetId === null ? null : targetHref !== null ? (
          <a
            href={targetHref}
            className="max-w-[24rem] truncate font-mono text-foreground underline underline-offset-4"
          >
            {entry.targetId}
          </a>
        ) : (
          <span className="max-w-[24rem] truncate font-mono">{entry.targetId}</span>
        )}

        {entry.runId !== null ? (
          <button
            type="button"
            className="relative inline-flex items-center font-medium text-foreground underline underline-offset-4 after:absolute after:-inset-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label={`Open the run behind ${entry.summary}`}
            onClick={() => onOpenRun(entry)}
          >
            Run detail
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function ActivityLog() {
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [actors, setActors] = useState<ActivityActorSummary[]>([]);
  const [hasActorError, setHasActorError] = useState(false);
  const [activityPage, setActivityPage] = useState<ActivityPage>({
    entries: [],
    total: 0,
    actions: [],
  });
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [isRunOpen, setIsRunOpen] = useState(false);
  const listControllerRef = useRef<AbortController | null>(null);
  const actorsControllerRef = useRef<AbortController | null>(null);

  const loadActivity = useCallback(async () => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;

    setIsFetching(true);
    setLoadError(null);

    try {
      const query = buildActivitySearchQuery({ filters, page, pageSize: PAGE_SIZE });
      const payload = await requestJson<unknown>(`${ACTIVITY_ENDPOINT}?${query}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      const parsed = parseActivityResponse(payload);
      setActivityPage(parsed);
      setHasLoaded(true);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsFetching(false);
      }
    }
  }, [filters, page]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    void loadActivity();
    return () => listControllerRef.current?.abort();
  }, [loadActivity]);

  useEffect(() => {
    const controller = new AbortController();
    actorsControllerRef.current = controller;

    const loadActors = async () => {
      try {
        const payload = await requestJson<unknown>(ACTORS_ENDPOINT, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        setActors(parseActorResponse(payload));
        setHasActorError(false);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setHasActorError(true);
      }
    };

    void loadActors();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (searchInput.trim() === filters.search) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput.trim() }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput, filters.search]);

  const actorOptions = useMemo<ActorOption[]>(() => {
    const options = actors.map((actor) => ({
      value: actor.id,
      label: `${actor.label} (${actor.type === 'agent' ? 'Agent' : 'User'})`,
    }));

    if (filters.actorId.length > 0 && !options.some((option) => option.value === filters.actorId)) {
      options.unshift({ value: filters.actorId, label: filters.actorId });
    }

    return options;
  }, [actors, filters.actorId]);

  const actionOptions = useMemo<string[]>(() => {
    const options = activityPage.actions;
    if (filters.action.length > 0 && !options.includes(filters.action)) {
      return [filters.action, ...options].sort();
    }

    return options;
  }, [activityPage.actions, filters.action]);

  const isSearchPending = searchInput.trim() !== filters.search;
  const isFiltered = hasActiveActivityFilters(filters, filters.search);
  const showSkeleton = !hasLoaded && isFetching;
  const showErrorState = loadError !== null && !hasLoaded;
  const showInlineError = loadError !== null && hasLoaded;
  const showEmpty =
    hasLoaded && !isFetching && loadError === null && activityPage.entries.length === 0;
  const showRows = activityPage.entries.length > 0;
  const isBusy = isFetching || isSearchPending;

  const updateFilters = (updates: Partial<ActivityFilters>) => {
    setFilters((current) => ({ ...current, ...updates }));
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const openRun = (entry: ActivityEntry) => {
    if (entry.runId === null) {
      return;
    }
    setOpenRunId(entry.runId);
    setIsRunOpen(true);
  };

  const handleRunRetried = () => {
    void loadActivity();
  };

  const now = isMounted ? Date.now() : null;

  return (
    <section aria-label="Activity log" className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Activity log</h3>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Every action you take in the CMS, and every event an agent reports, is recorded here.
          Filter by actor, action, target, or a date range, then open a run to see what the agent
          produced.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => event.preventDefault()}
        aria-label="Filter activity"
      >
        <div className="flex min-w-[9rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="activity-scope">Scope</Label>
          <Select
            id="activity-scope"
            value={filters.scope}
            disabled={isBusy}
            onChange={(event) => {
              const scope = event.target.value;
              updateFilters({
                scope: scope === 'user' || scope === 'agent' ? scope : 'all',
                actorId: '',
              });
            }}
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="activity-actor">Actor</Label>
          <Select
            id="activity-actor"
            value={filters.actorId}
            disabled={isBusy}
            onChange={(event) => updateFilters({ actorId: event.target.value })}
          >
            <option value="">All actors</option>
            {actorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="activity-action">Action</Label>
          <Select
            id="activity-action"
            value={filters.action}
            disabled={isBusy}
            onChange={(event) => updateFilters({ action: event.target.value })}
          >
            <option value="">All actions</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
          <Label htmlFor="activity-target-type">Target</Label>
          <Select
            id="activity-target-type"
            value={filters.targetType}
            disabled={isBusy}
            onChange={(event) => updateFilters({ targetType: event.target.value })}
          >
            <option value="">All targets</option>
            {TARGET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex min-w-[12rem] flex-[2] flex-col gap-1.5">
          <Label htmlFor="activity-search">Search</Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="activity-search"
              type="search"
              className="pl-9"
              placeholder="Search summaries"
              value={searchInput}
              maxLength={SEARCH_MAX_LENGTH}
              autoComplete="off"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
        </div>

        <div className="flex min-w-[9rem] flex-col gap-1.5">
          <Label htmlFor="activity-since">From</Label>
          <input
            id="activity-since"
            type="date"
            value={filters.since}
            disabled={isBusy}
            onChange={(event) => updateFilters({ since: event.target.value })}
          />
        </div>

        <div className="flex min-w-[9rem] flex-col gap-1.5">
          <Label htmlFor="activity-until">To</Label>
          <input
            id="activity-until"
            type="date"
            value={filters.until}
            disabled={isBusy}
            onChange={(event) => updateFilters({ until: event.target.value })}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
          onClick={handleResetFilters}
          disabled={!isFiltered || isBusy}
        >
          <RotateCcwIcon />
          Reset
        </Button>
      </form>

      {hasActorError ? (
        <p className="text-xs text-muted-foreground">
          The actor list is unavailable right now. Retry the page to filter by a single actor.
        </p>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {isFetching ? 'Loading activity entries' : ''}
      </p>

      {showInlineError ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="whitespace-nowrap"
            disabled={isFetching}
            onClick={() => void loadActivity()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {showSkeleton ? (
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {SKELETON_ROWS.map((rowKey) => (
            <ActivityRowSkeleton key={rowKey} />
          ))}
        </ul>
      ) : null}

      {showErrorState ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <TriangleAlertIcon className="size-8 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load activity</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => void loadActivity()}
          >
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : null}

      {showEmpty ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6"
        >
          {isFiltered ? (
            <SearchXIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          ) : (
            <InboxIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {isFiltered ? 'No activity matches these filters' : 'No activity recorded yet'}
            </p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {isFiltered
                ? 'Widen the date range, clear the search, or pick a different actor to see more entries.'
                : 'Every action you take in the CMS, and every event an agent reports, will appear in this list.'}
            </p>
          </div>
          {isFiltered ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={handleResetFilters}
            >
              Reset filters
            </Button>
          ) : null}
        </div>
      ) : null}

      {showRows ? (
        <>
          <ul
            aria-label="Activity entries"
            aria-busy={isBusy}
            className={cn(
              'divide-y divide-border overflow-hidden rounded-lg border border-border bg-card',
              isFetching && hasLoaded && 'opacity-70',
            )}
          >
            {activityPage.entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} now={now} onOpenRun={openRun} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 tabular-nums">
              <span>
                {formatRangeLabel(activityPage.total, page, PAGE_SIZE, activityPage.entries.length)}
              </span>
              {isFetching && hasLoaded ? (
                <span role="status" aria-live="polite" className="flex items-center gap-1 text-xs">
                  <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
                  Updating
                </span>
              ) : null}
            </p>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={isBusy || page <= 1}
              >
                <ChevronLeftIcon />
                Previous
              </Button>
              <span className="tabular-nums">
                {formatPaginationSummary(activityPage.total, page, PAGE_SIZE)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => setPage((current) => current + 1)}
                disabled={isBusy || page * PAGE_SIZE >= activityPage.total}
              >
                Next
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <ActivityRunDialog
        runId={openRunId}
        isOpen={isRunOpen}
        onOpenChange={setIsRunOpen}
        onRetried={handleRunRetried}
      />
    </section>
  );
}
