import {
  EyeIcon,
  NotebookTextIcon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';
import ResearchNotes, {
  formatAbsoluteTime,
  formatRelativeTime,
  type ResearchTopic,
  type TopicStatus,
  TopicStatusBadge,
} from './research-notes';

const RESEARCH_ENDPOINT = '/api/dashboard/agents/research';
const ALL_FILTER = 'all';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TOKEN_FORMATTER = new Intl.NumberFormat('en-US');

const SKELETON_STATS = ['stat-1', 'stat-2', 'stat-3', 'stat-4', 'stat-5', 'stat-6'];

interface ResearchCounts {
  queued: number;
  fetched: number;
  researched: number;
  inProgress: number;
  used: number;
  blocked: number;
}

interface ResearchTopicRow {
  id: string;
  title: string;
  status: TopicStatus;
  category: string | null;
  verifiedNotes: number;
  unverifiedNotes: number;
  gaps: number;
  updatedAt: string;
}

interface ResearchNoteRow {
  id: string;
  topicId: string;
  topicTitle: string;
  kind: string;
  heading: string;
  detail: string;
  url: string | null;
  quote: string | null;
  verified: boolean;
  sourceType: string | null;
  angle: string | null;
  createdAt: string;
}

interface ResearchRun {
  id: string;
  status: string;
  summary: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  startedAt: string;
  finishedAt: string | null;
  output: string | null;
}

interface ResearchUsage {
  paused: boolean;
  dailySearches: number;
  monthlySearches: number;
  dailyTokens: number;
  searchUsedToday: number;
  searchUsedThisMonth: number;
  tokensUsedToday: number;
  freeCredits: number;
  estimatedCostUsd: number;
  paidMode: boolean;
  warning: boolean;
  searchesRemaining: number;
}

interface ResearchOverview {
  counts: ResearchCounts;
  topics: ResearchTopicRow[];
  notes: ResearchNoteRow[];
  runs: ResearchRun[];
  usage: ResearchUsage;
}

const TOPIC_STATUS_CARDS: Array<{ key: keyof ResearchCounts; label: string }> = [
  { key: 'queued', label: 'Queued' },
  { key: 'fetched', label: 'Fetched' },
  { key: 'researched', label: 'Researched' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'used', label: 'Used' },
  { key: 'blocked', label: 'Blocked' },
];

const EMPTY_NOTES: ResearchNoteRow[] = [];

function toSafeUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 tabular-nums text-foreground">{value.toLocaleString('en-US')}</dd>
    </div>
  );
}

export default function ResearchOverview() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overview, setOverview] = useState<ResearchOverview | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState(ALL_FILTER);
  const [angleFilter, setAngleFilter] = useState(ALL_FILTER);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [notesTopic, setNotesTopic] = useState<ResearchTopic | null>(null);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [outputRun, setOutputRun] = useState<ResearchRun | null>(null);
  const [isOutputOpen, setIsOutputOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const searchInputId = useId();
  const kindSelectId = useId();
  const angleSelectId = useId();
  const verifiedOnlyId = useId();

  const loadOverview = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const payload = await requestJson<ResearchOverview>(RESEARCH_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setOverview(payload);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    return () => controllerRef.current?.abort();
  }, [loadOverview]);

  const notes = overview?.notes ?? EMPTY_NOTES;
  const topics = overview?.topics ?? [];
  const runs = overview?.runs ?? [];

  const kindOptions = useMemo(
    () =>
      Array.from(new Set(notes.map((note) => note.kind))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [notes],
  );

  const angleOptions = useMemo(
    () =>
      Array.from(
        new Set(notes.map((note) => note.angle).filter((angle): angle is string => Boolean(angle))),
      ).sort((left, right) => left.localeCompare(right)),
    [notes],
  );

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return notes.filter((note) => {
      if (kindFilter !== ALL_FILTER && note.kind !== kindFilter) {
        return false;
      }
      if (angleFilter !== ALL_FILTER && note.angle !== angleFilter) {
        return false;
      }
      if (verifiedOnly && !note.verified) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      return (
        note.heading.toLowerCase().includes(query) ||
        note.detail.toLowerCase().includes(query) ||
        note.topicTitle.toLowerCase().includes(query)
      );
    });
  }, [notes, searchQuery, kindFilter, angleFilter, verifiedOnly]);

  const verifiedCount = useMemo(() => notes.filter((note) => note.verified).length, [notes]);
  const unverifiedCount = notes.length - verifiedCount;
  const coverageGaps = useMemo(
    () => topics.reduce((total, topic) => total + topic.gaps, 0),
    [topics],
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    kindFilter !== ALL_FILTER ||
    angleFilter !== ALL_FILTER ||
    verifiedOnly;

  const handleOpenNotes = (topic: ResearchTopicRow) => {
    setNotesTopic({ id: topic.id, title: topic.title, status: topic.status });
    setIsNotesOpen(true);
  };

  const handleOpenOutput = (run: ResearchRun) => {
    setOutputRun(run);
    setIsOutputOpen(true);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setKindFilter(ALL_FILTER);
    setAngleFilter(ALL_FILTER);
    setVerifiedOnly(false);
  };

  if (status === 'loading') {
    return (
      <section
        aria-label="Research overview"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <span className="sr-only">Loading research overview</span>
        <Skeleton className="h-5 w-48" />
        <div className="grid gap-2 sm:grid-cols-3">
          {SKELETON_STATS.map((statKey) => (
            <Skeleton key={statKey} className="h-16 w-full" />
          ))}
        </div>
        <Skeleton className="h-4 w-64" />
      </section>
    );
  }

  if (status === 'error' || !overview) {
    return (
      <section
        aria-label="Research overview"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <TriangleAlertIcon className="size-6 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Could not load the research overview
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadOverview()}>
          <RefreshCwIcon />
          Retry
        </Button>
      </section>
    );
  }

  const showCost = overview.usage.paidMode || overview.usage.estimatedCostUsd > 0;
  const hasNotes = notes.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Research overview"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <SearchIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">Research status</h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              What the scrapper agent has queued, fetched, and turned into notes, and how much of
              the search budget those runs used.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              Topics
            </h3>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Topics by status">
              {TOPIC_STATUS_CARDS.map((card) => (
                <StatCard key={card.key} label={card.label} value={overview.counts[card.key]} />
              ))}
            </dl>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
              Research notes
            </h3>
            <dl
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              aria-label="Research notes summary"
            >
              <StatCard label="Verified" value={verifiedCount} />
              <StatCard label="Unverified" value={unverifiedCount} />
              <StatCard label="Coverage gaps" value={coverageGaps} />
            </dl>
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <span>
            Searches today {overview.usage.searchUsedToday} / {overview.usage.dailySearches}
          </span>
          <span>
            Searches this month {overview.usage.searchUsedThisMonth} /{' '}
            {overview.usage.monthlySearches}
          </span>
          {showCost ? (
            <span>Estimated cost {USD_FORMATTER.format(overview.usage.estimatedCostUsd)}</span>
          ) : null}
        </p>
      </section>

      <section
        aria-label="Research notes"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">All research notes</h2>
          <span
            role="status"
            aria-live="polite"
            className="text-xs tabular-nums text-muted-foreground"
          >
            {filteredNotes.length} of {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2 lg:col-span-2">
            <Label htmlFor={searchInputId}>Search notes</Label>
            <Input
              id={searchInputId}
              type="search"
              value={searchQuery}
              autoComplete="off"
              placeholder="Search heading, detail, or topic"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={kindSelectId}>Kind</Label>
            <select
              id={kindSelectId}
              className={SELECT_CLASS}
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
            >
              <option value={ALL_FILTER}>All kinds</option>
              {kindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={angleSelectId}>Angle</Label>
            <select
              id={angleSelectId}
              className={SELECT_CLASS}
              value={angleFilter}
              onChange={(event) => setAngleFilter(event.target.value)}
            >
              <option value={ALL_FILTER}>All angles</option>
              {angleOptions.map((angle) => (
                <option key={angle} value={angle}>
                  {angle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor={verifiedOnlyId} className="flex items-center gap-2 text-sm text-foreground">
          <input
            id={verifiedOnlyId}
            type="checkbox"
            className="size-4 rounded border-input"
            checked={verifiedOnly}
            onChange={(event) => setVerifiedOnly(event.target.checked)}
          />
          Verified only
        </label>

        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
            <NotebookTextIcon className="size-6 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasNotes ? 'No notes match these filters' : 'No research notes yet'}
              </p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {hasNotes
                  ? 'Clear a filter or search a different term to see the research notes.'
                  : 'The scrapper agent fills this in on its next run, one note per finding so the writer has evidence to cite.'}
              </p>
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {filteredNotes.map((note) => {
              const sourceUrl = toSafeUrl(note.url);

              return (
                <li key={note.id} className="flex flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{note.heading}</p>
                    {note.verified ? <Badge variant="secondary">Verified</Badge> : null}
                    <Badge variant="outline">Kind: {note.kind}</Badge>
                    {note.angle ? <Badge variant="outline">Angle: {note.angle}</Badge> : null}
                    {note.sourceType ? (
                      <Badge variant="outline">Source type: {note.sourceType}</Badge>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium tracking-[0.06em] uppercase">Topic</span>{' '}
                    <span className="text-foreground">{note.topicTitle}</span>
                  </p>

                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{note.detail}</p>

                  {sourceUrl ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium tracking-[0.06em] uppercase">Source</span>{' '}
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-foreground underline underline-offset-4"
                      >
                        {note.url}
                      </a>
                    </p>
                  ) : null}

                  {note.quote ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium tracking-[0.06em] uppercase">Quote</span>{' '}
                      <span className="text-foreground italic">{note.quote}</span>
                    </p>
                  ) : null}

                  <p className="text-xs tabular-nums text-muted-foreground">
                    <time dateTime={note.createdAt} title={formatAbsoluteTime(note.createdAt)}>
                      {formatRelativeTime(note.createdAt)}
                    </time>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-label="Topics"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h2 className="text-sm font-medium text-foreground">Topics</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Gaps</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="whitespace-normal text-muted-foreground">
                  No topics have been queued for research yet.
                </TableCell>
              </TableRow>
            ) : (
              topics.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="whitespace-normal text-foreground">{topic.title}</TableCell>
                  <TableCell>
                    <TopicStatusBadge status={topic.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {topic.verifiedNotes} verified, {topic.unverifiedNotes} unverified
                  </TableCell>
                  <TableCell className="tabular-nums">{topic.gaps}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    <time dateTime={topic.updatedAt} title={formatAbsoluteTime(topic.updatedAt)}>
                      {formatRelativeTime(topic.updatedAt)}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                      aria-label={`View notes for ${topic.title}`}
                      onClick={() => handleOpenNotes(topic)}
                    >
                      View notes
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section
        aria-label="Recent scrapper runs"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h2 className="text-sm font-medium text-foreground">Recent scrapper runs</h2>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No scrapper runs have been recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{run.status}</Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      <time dateTime={run.startedAt} title={formatAbsoluteTime(run.startedAt)}>
                        {formatRelativeTime(run.startedAt)}
                      </time>
                    </span>
                  </div>
                  <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                    {run.summary ?? 'No summary recorded.'}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {run.tokensIn === null && run.tokensOut === null
                      ? 'No token usage recorded.'
                      : `${TOKEN_FORMATTER.format(run.tokensIn ?? 0)} tokens in / ${TOKEN_FORMATTER.format(run.tokensOut ?? 0)} tokens out`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  aria-label={`View output for the run from ${formatAbsoluteTime(run.startedAt)}`}
                  onClick={() => handleOpenOutput(run)}
                >
                  <EyeIcon />
                  View output
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ResearchNotes topic={notesTopic} isOpen={isNotesOpen} onOpenChange={setIsNotesOpen} />

      <DialogPrimitive.Root open={isOutputOpen} onOpenChange={setIsOutputOpen}>
        <DialogSurface className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="pr-8 text-base font-semibold text-foreground">
              Scrapper run output
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {outputRun
                ? `Raw output from the run started ${formatAbsoluteTime(outputRun.startedAt)}.`
                : 'Raw output from the scrapper run.'}
            </DialogPrimitive.Description>
          </div>
          {outputRun?.output ? (
            <pre className="max-h-[60dvh] overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs whitespace-pre text-foreground">
              {outputRun.output}
            </pre>
          ) : (
            <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              No output recorded for this run.
            </p>
          )}
        </DialogSurface>
      </DialogPrimitive.Root>
    </div>
  );
}
