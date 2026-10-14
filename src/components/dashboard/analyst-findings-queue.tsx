import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalystFindingRecord, AnalystFindingStatus } from '@/lib/agents/analyst/findings';
import type { AnalystFindingPage } from '@/lib/dashboard/analyst';
import {
  ANALYST_FINDING_STATUS_FILTERS,
  ANALYST_FINDING_STATUS_LABELS,
  buildEvidenceEntries,
  describeAnalystAction,
  describeAnalystEffort,
  describeAnalystRule,
  describeAnalystSource,
  describeAnalystSourceState,
  formatAnalystConfidence,
  formatAnalystSourceList,
  resolveAnalystSubject,
} from '@/lib/dashboard/analyst-presentation';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { requestJson, toErrorMessage } from './api-client';

const FINDINGS_ENDPOINT = '/api/dashboard/analyst/findings';
const ACTION_CLASS = 'h-11 px-4 sm:h-8 sm:px-3';
const TOGGLE_CLASS =
  'min-h-11 px-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-8 sm:py-0.5';
const SKELETON_ROWS = ['finding-skeleton-1', 'finding-skeleton-2', 'finding-skeleton-3'];

const STATUS_OPTIONS: Array<{ value: AnalystFindingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  ...ANALYST_FINDING_STATUS_FILTERS.map((status) => ({
    value: status,
    label: ANALYST_FINDING_STATUS_LABELS[status],
  })),
];

const STATUS_BADGE_VARIANTS: Record<
  AnalystFindingStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  open: 'default',
  actioned: 'secondary',
  resolved: 'outline',
  dismissed: 'secondary',
  expired: 'outline',
};

interface AnalystFindingsQueueProps {
  initial: AnalystFindingPage;
  unconnectedSources: string[];
  dismissalWindowDays: number;
}

interface FilterState {
  status: AnalystFindingStatus | 'all';
  rule: string | null;
}

function buildFindingsUrl(filter: FilterState, limit: number, offset: number): string {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });

  if (filter.status !== 'all') {
    params.set('status', filter.status);
  }

  if (filter.rule !== null) {
    params.set('rule', filter.rule);
  }

  return `${FINDINGS_ENDPOINT}?${params.toString()}`;
}

function FindingSkeleton() {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-8 w-48" />
    </li>
  );
}

function ConfidenceMarker({ confidence }: { confidence: number }) {
  const label = formatAnalystConfidence(confidence);
  const width = Math.round(Math.min(Math.max(confidence, 0), 1) * 100);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs tracking-[0.08em] text-muted-foreground uppercase">Confidence</span>
      <span className="flex items-center gap-2">
        <span
          className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Confidence ${label}`}
        >
          <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
        </span>
        <span className="text-sm tabular-nums">{label}</span>
      </span>
    </div>
  );
}

function EvidenceBlock({ finding }: { finding: AnalystFindingRecord }) {
  const entries = buildEvidenceEntries(finding.evidence);
  const quality = Object.entries(finding.dataQuality);

  return (
    <div
      id={`analyst-finding-evidence-${finding.id}`}
      className="mt-3 rounded-md border border-border bg-muted/40 p-3"
    >
      <h4 className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
        Numbers recorded when this finding was stored
      </h4>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          This finding carries no recorded numbers.
        </p>
      ) : (
        <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {entries.map((entry) => (
            <div key={entry.key} className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{entry.label}</dt>
              <dd className="text-sm break-words tabular-nums">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <h4 className="mt-4 text-xs tracking-[0.08em] text-muted-foreground uppercase">
        Source state when it was stored
      </h4>
      {quality.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No source state was recorded.</p>
      ) : (
        <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {quality.map(([source, state]) => (
            <div key={source} className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{describeAnalystSource(source)}</dt>
              <dd className="text-sm">{describeAnalystSourceState(String(state))}</dd>
            </div>
          ))}
        </dl>
      )}

      <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col">
          <dt className="text-xs text-muted-foreground">Finding key</dt>
          <dd className="font-mono text-xs break-words">{finding.findingKey}</dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-xs text-muted-foreground">First seen</dt>
          <dd className="text-xs tabular-nums">{formatRelativeTime(finding.firstSeenAt)}</dd>
        </div>
        <div className="flex min-w-0 flex-col">
          <dt className="text-xs text-muted-foreground">Last seen</dt>
          <dd className="text-xs tabular-nums">{formatRelativeTime(finding.lastSeenAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

interface FindingRowProps {
  finding: AnalystFindingRecord;
  isExpanded: boolean;
  isBusy: boolean;
  isDismissing: boolean;
  dismissReason: string;
  dismissError: string | null;
  dismissalWindowDays: number;
  onToggleEvidence: () => void;
  onResolve: () => void;
  onStartDismiss: () => void;
  onCancelDismiss: () => void;
  onDismissReasonChange: (value: string) => void;
  onDismiss: () => void;
  onReopen: () => void;
}

function FindingRow({
  finding,
  isExpanded,
  isBusy,
  isDismissing,
  dismissReason,
  dismissError,
  dismissalWindowDays,
  onToggleEvidence,
  onResolve,
  onStartDismiss,
  onCancelDismiss,
  onDismissReasonChange,
  onDismiss,
  onReopen,
}: FindingRowProps) {
  const subject = resolveAnalystSubject(finding.subjectType, finding.subjectId);
  const evidenceId = `analyst-finding-evidence-${finding.id}`;
  const dismissInputId = `analyst-finding-dismiss-${finding.id}`;
  const dismissHelpId = `${dismissInputId}-help`;
  const dismissErrorId = `${dismissInputId}-error`;
  const canReopen = finding.status !== 'expired' && finding.status !== 'open';
  const canResolve =
    finding.status === 'open' || finding.status === 'actioned' || finding.status === 'dismissed';
  const canDismiss = finding.status !== 'dismissed';

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="tabular-nums">
          Priority {finding.score}
        </Badge>
        <Badge variant={STATUS_BADGE_VARIANTS[finding.status]}>
          {ANALYST_FINDING_STATUS_LABELS[finding.status]}
        </Badge>
        <Badge variant="outline">{describeAnalystRule(finding.ruleId)}</Badge>
        <span className="text-xs text-muted-foreground">
          {describeAnalystAction(finding.actionType)} ·{' '}
          {describeAnalystEffort(finding.actionEffort)}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-medium text-foreground">{finding.title}</h3>

      {subject ? (
        <p className="mt-1 text-xs text-muted-foreground">
          <a href={subject.href} className="underline-offset-4 hover:underline">
            {subject.linkLabel}
          </a>
          {subject.detail === null ? null : (
            <span className="ml-2 font-mono text-foreground">{subject.detail}</span>
          )}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Subject {finding.subjectType}:{' '}
          <span className="font-mono text-foreground">{finding.subjectId}</span>
        </p>
      )}

      <p className="mt-2 max-w-prose text-sm text-muted-foreground">{finding.detail}</p>

      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
        <ConfidenceMarker confidence={finding.confidence} />
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">Runs seen</dt>
          <dd className="text-sm tabular-nums">
            {finding.seenCount} {finding.seenCount === 1 ? 'run' : 'runs'}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">Window</dt>
          <dd className="text-sm tabular-nums">
            {finding.windowStart} to {finding.windowEnd}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">Baseline</dt>
          <dd className="text-sm tabular-nums">
            {finding.baselineStart} to {finding.baselineEnd}
          </dd>
        </div>
      </dl>

      {finding.resolutionNote ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Last note from {finding.resolvedBy ?? 'the system'}: {finding.resolutionNote}
        </p>
      ) : null}

      {finding.status === 'expired' ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Expired findings reopen on their own if the analyst detects the subject again.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ACTION_CLASS}
          aria-expanded={isExpanded}
          aria-controls={evidenceId}
          onClick={onToggleEvidence}
        >
          {isExpanded ? (
            <ChevronDownIcon aria-hidden="true" />
          ) : (
            <ChevronRightIcon aria-hidden="true" />
          )}
          {isExpanded ? 'Hide evidence' : 'Evidence'}
        </Button>

        {canResolve ? (
          <Button
            type="button"
            size="sm"
            className={ACTION_CLASS}
            disabled={isBusy}
            onClick={onResolve}
          >
            {isBusy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
            Mark resolved
          </Button>
        ) : null}

        {canDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={ACTION_CLASS}
            disabled={isBusy}
            onClick={onStartDismiss}
          >
            Dismiss
          </Button>
        ) : null}

        {canReopen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={ACTION_CLASS}
            disabled={isBusy}
            onClick={onReopen}
          >
            Reopen
          </Button>
        ) : null}
      </div>

      {isDismissing ? (
        <form
          className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onDismiss();
          }}
        >
          <Label htmlFor={dismissInputId}>Why dismiss this finding?</Label>
          <Input
            id={dismissInputId}
            value={dismissReason}
            maxLength={280}
            autoComplete="off"
            aria-invalid={dismissError !== null}
            aria-describedby={dismissError ? `${dismissHelpId} ${dismissErrorId}` : dismissHelpId}
            onChange={(event) => onDismissReasonChange(event.target.value)}
          />
          <p id={dismissHelpId} className="text-xs text-muted-foreground">
            The reason is recorded on the finding and the analyst keeps it quiet for{' '}
            {dismissalWindowDays} days.
          </p>
          {dismissError ? (
            <p id={dismissErrorId} className="text-sm text-destructive">
              {dismissError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              className={ACTION_CLASS}
              disabled={isBusy}
            >
              {isBusy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
              Dismiss finding
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={ACTION_CLASS}
              disabled={isBusy}
              onClick={onCancelDismiss}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {isExpanded ? <EvidenceBlock finding={finding} /> : null}
    </li>
  );
}

export default function AnalystFindingsQueue({
  initial,
  unconnectedSources,
  dismissalWindowDays,
}: AnalystFindingsQueueProps) {
  const [page, setPage] = useState<AnalystFindingPage>(initial);
  const [filter, setFilter] = useState<FilterState>({ status: 'open', rule: null });
  const [loadState, setLoadState] = useState<'ready' | 'loading' | 'error'>('ready');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const limit = initial.page.limit;

  const loadPage = useCallback(
    async (nextFilter: FilterState, offset: number, mode: 'replace' | 'append') => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setLoadState('loading');
      setLoadError(null);

      try {
        const payload = await requestJson<AnalystFindingPage>(
          buildFindingsUrl(nextFilter, limit, offset),
          { signal: controller.signal },
        );

        if (controller.signal.aborted) {
          return;
        }

        setPage((current) => {
          if (mode === 'replace') {
            return payload;
          }

          const knownIds = new Set(current.findings.map((entry) => entry.id));

          return {
            ...payload,
            findings: [
              ...current.findings,
              ...payload.findings.filter((entry) => !knownIds.has(entry.id)),
            ],
          };
        });
        setLoadState('ready');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setLoadError(toErrorMessage(error));
        setLoadState('error');
      }
    },
    [limit],
  );

  useEffect(() => () => controllerRef.current?.abort(), []);

  const applyFilter = (nextFilter: FilterState) => {
    setFilter(nextFilter);
    setExpandedIds(new Set());
    setDismissId(null);
    setDismissReason('');
    setDismissError(null);
    setActionError(null);
    void loadPage(nextFilter, 0, 'replace');
  };

  const applyStatus = async (
    finding: AnalystFindingRecord,
    target: AnalystFindingStatus,
    note: string,
  ) => {
    if (busyId !== null) {
      return;
    }

    const trimmedNote = note.trim();
    setBusyId(finding.id);
    setActionError(null);
    setDismissError(null);

    try {
      await requestJson<{ finding: AnalystFindingRecord }>(
        `${FINDINGS_ENDPOINT}/${encodeURIComponent(finding.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: target,
            ...(trimmedNote === '' ? {} : { note: trimmedNote }),
          }),
        },
      );

      toast.success(
        target === 'resolved'
          ? 'Finding marked resolved.'
          : target === 'dismissed'
            ? 'Finding dismissed.'
            : 'Finding reopened.',
      );
      setDismissId(null);
      setDismissReason('');
      await loadPage(filter, 0, 'replace');
    } catch (error) {
      const message = toErrorMessage(error);
      setActionError(message);
      setDismissError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const ruleOptions = useMemo(() => {
    const options = Object.entries(page.totals.byRule).map(([ruleId, count]) => ({
      ruleId,
      count,
      label: describeAnalystRule(ruleId),
    }));

    if (filter.rule !== null && !options.some((option) => option.ruleId === filter.rule)) {
      options.push({ ruleId: filter.rule, count: 0, label: describeAnalystRule(filter.rule) });
    }

    return options.sort((first, second) => first.label.localeCompare(second.label));
  }, [page.totals.byRule, filter.rule]);

  const isDefaultFilter = filter.status === 'open' && filter.rule === null;
  const hasResults = page.findings.length > 0;
  const showSkeletons = loadState === 'loading' && !hasResults;
  const showErrorState = loadState === 'error' && !hasResults;
  const showEmptyState = loadState === 'ready' && !hasResults;
  const showNoFindingsYet = showEmptyState && page.totals.total === 0;
  const showQueueClear = showEmptyState && page.totals.total > 0 && isDefaultFilter;
  const showEmptyForFilter = showEmptyState && page.totals.total > 0 && !isDefaultFilter;
  const filterDescription = `${filter.status === 'all' ? 'all statuses' : ANALYST_FINDING_STATUS_LABELS[filter.status]}${
    filter.rule === null ? '' : ` and the "${describeAnalystRule(filter.rule)}" rule`
  }`;
  const unavailableSummary =
    unconnectedSources.length > 0
      ? `${formatAnalystSourceList(unconnectedSources)} ${unconnectedSources.length === 1 ? 'is' : 'are'} not connected`
      : '';

  return (
    <section aria-label="Findings queue" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Work queue
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Every finding carries the numbers and the thresholds that produced it. Resolving or
            dismissing one here changes what the analyst reports next, not what the article does.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loadState === 'loading' ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              Loading
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground tabular-nums">
            Showing {page.findings.length} of {page.page.total}
          </span>
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {loadState === 'ready'
          ? `${page.page.total} ${page.page.total === 1 ? 'finding' : 'findings'} match ${filterDescription}.`
          : ''}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex flex-wrap items-center gap-0.5 rounded-md border border-border p-0.5">
          <legend className="sr-only">Status</legend>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === filter.status}
              onClick={() => applyFilter({ status: option.value, rule: filter.rule })}
              className={cn(
                'rounded px-2.5 text-xs font-medium transition-colors',
                TOGGLE_CLASS,
                option.value === filter.status
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <div className="flex items-center gap-2">
          <Label htmlFor="analyst-rule-filter">Rule</Label>
          <select
            id="analyst-rule-filter"
            className="select-control min-w-0"
            value={filter.rule ?? ''}
            onChange={(event) =>
              applyFilter({
                status: filter.status,
                rule: event.target.value === '' ? null : event.target.value,
              })
            }
          >
            <option value="">All rules</option>
            {ruleOptions.map((option) => (
              <option key={option.ruleId} value={option.ruleId}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {actionError !== null && !showErrorState ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {actionError}
        </p>
      ) : null}

      {showErrorState ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4">
          <TriangleAlertIcon className="size-6 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load the findings</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ACTION_CLASS}
            onClick={() => void loadPage(filter, 0, 'replace')}
          >
            <RefreshCwIcon aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {showSkeletons ? (
        <>
          <p className="sr-only">Loading findings</p>
          <ul className="flex flex-col gap-3" aria-busy="true">
            {SKELETON_ROWS.map((rowKey) => (
              <FindingSkeleton key={rowKey} />
            ))}
          </ul>
        </>
      ) : null}

      {showNoFindingsYet ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">
            The analyst has not written a finding yet
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Findings appear after a completed run of the Performance Analyst across the analytics
            tables. It runs on the schedule below, or on demand from the Agents page.
          </p>
          {unavailableSummary === '' ? null : (
            <p className="max-w-prose text-sm text-muted-foreground">
              {unavailableSummary}, so findings that depend on them cannot appear yet. The data
              sources panel below names the next action for each one.
            </p>
          )}
        </div>
      ) : null}

      {showQueueClear ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Nothing is open</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Every finding is resolved, dismissed, or expired. New work appears after the next run.
          </p>
          {unavailableSummary === '' ? null : (
            <p className="max-w-prose text-sm text-muted-foreground">
              This is not a clean bill of health: {unavailableSummary}, so the rules that depend on
              them stay dormant. The data sources panel below names the next action for each one.
            </p>
          )}
        </div>
      ) : null}

      {showEmptyForFilter ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">No findings for {filterDescription}</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            The queue holds {page.totals.total} findings in other states.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ACTION_CLASS}
            onClick={() => applyFilter({ status: 'open', rule: null })}
          >
            Show the open queue
          </Button>
        </div>
      ) : null}

      {hasResults ? (
        <ul className={cn('flex flex-col gap-3', loadState === 'loading' && 'opacity-60')}>
          {page.findings.map((finding) => (
            <FindingRow
              key={finding.id}
              finding={finding}
              isExpanded={expandedIds.has(finding.id)}
              isBusy={busyId === finding.id}
              isDismissing={dismissId === finding.id}
              dismissReason={dismissReason}
              dismissError={dismissId === finding.id ? dismissError : null}
              dismissalWindowDays={dismissalWindowDays}
              onToggleEvidence={() =>
                setExpandedIds((current) => {
                  const next = new Set(current);

                  if (next.has(finding.id)) {
                    next.delete(finding.id);
                  } else {
                    next.add(finding.id);
                  }

                  return next;
                })
              }
              onResolve={() => void applyStatus(finding, 'resolved', '')}
              onStartDismiss={() => {
                setDismissId(finding.id);
                setDismissReason('');
                setDismissError(null);
              }}
              onCancelDismiss={() => {
                setDismissId(null);
                setDismissReason('');
                setDismissError(null);
              }}
              onDismissReasonChange={setDismissReason}
              onDismiss={() => {
                if (dismissReason.trim().length < 3) {
                  setDismissError('Enter at least a few words so the reason is useful later.');
                  return;
                }

                void applyStatus(finding, 'dismissed', dismissReason);
              }}
              onReopen={() => void applyStatus(finding, 'open', '')}
            />
          ))}
        </ul>
      ) : null}

      {hasResults && page.page.hasMore ? (
        <Button
          type="button"
          variant="outline"
          className={cn('self-start whitespace-nowrap', ACTION_CLASS)}
          disabled={loadState === 'loading'}
          onClick={() => void loadPage(filter, page.findings.length, 'append')}
        >
          Load more findings
        </Button>
      ) : null}
    </section>
  );
}
