import { ActivityIcon, BotIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AgentLiveSnapshot, LiveNextRun, LivePipeline, LiveRun } from '@/lib/agents/live';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';

const LIVE_ENDPOINT = '/api/dashboard/agents/live';
const POLL_MS = 10_000;
const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SKELETON_CARDS = ['agent-live-skeleton-1', 'agent-live-skeleton-2', 'agent-live-skeleton-3'];

const ROLE_LABELS: Record<string, string> = {
  writer: 'Writer',
  reviewer: 'Reviewer',
  qc: 'QC',
  scrapper: 'Scrapper',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function formatElapsed(startedAt: string, now: number): string {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) {
    return 'unknown';
  }

  const minutes = Math.max(0, Math.floor((now - started) / MINUTE_MS));
  if (minutes < 1) {
    return 'just started';
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const remainder = minutes % MINUTES_PER_HOUR;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatCountdown(nextRunAt: string, now: number): string {
  const target = new Date(nextRunAt).getTime();
  if (Number.isNaN(target)) {
    return 'soon';
  }

  const difference = target - now;
  if (difference <= 0) {
    return 'due now';
  }

  const minutes = Math.round(difference / MINUTE_MS);
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return `${hours}h`;
  }

  return `${Math.round(hours / HOURS_PER_DAY)}d`;
}

function WorkingDot() {
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
      <span className="absolute inline-flex size-full animate-pulse rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function AgentStateCard({
  agent,
  running,
  now,
}: {
  agent: LiveNextRun;
  running: LiveRun | undefined;
  now: number;
}) {
  const isWorking = running !== undefined;
  const stateLabel = isWorking
    ? `Working now, ${formatElapsed(running.startedAt, now)}`
    : !agent.enabled
      ? 'Idle, disabled'
      : agent.nextRunAt
        ? `Next run in ${formatCountdown(agent.nextRunAt, now)}`
        : 'Idle';

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow duration-200',
        isWorking ? 'border-primary ring-1 ring-primary/30' : 'border-border',
        !agent.enabled && !isWorking && 'opacity-70',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className="text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {roleLabel(agent.role)}
        </Badge>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs',
            agent.enabled ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              agent.enabled ? 'bg-primary' : 'bg-muted-foreground',
            )}
            aria-hidden="true"
          />
          {agent.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <h3 className="truncate text-sm font-semibold text-foreground" title={agent.agentName}>
        {agent.agentName}
      </h3>

      <p
        className={cn(
          'flex items-center gap-2 text-sm tabular-nums',
          isWorking ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {isWorking ? <WorkingDot /> : null}
        {stateLabel}
      </p>
    </article>
  );
}

function PipelineStrip({ pipeline }: { pipeline: LivePipeline }) {
  const stages = [
    { key: 'queued', label: 'Queued', value: pipeline.topicsQueued },
    { key: 'fetched', label: 'Fetched', value: pipeline.topicsFetched },
    { key: 'researched', label: 'Researched', value: pipeline.topicsResearched },
    { key: 'inProgress', label: 'In progress', value: pipeline.topicsInProgress },
    { key: 'pendingReview', label: 'Pending review', value: pipeline.pendingReview },
    { key: 'changesRequested', label: 'Changes requested', value: pipeline.changesRequested },
  ];

  return (
    <section aria-label="Pipeline" className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <ActivityIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Pipeline
        </h3>
      </div>
      <ol className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
        {stages.map((stage) => (
          <li key={stage.key} className="flex flex-col gap-1 bg-card px-3 py-3">
            <span className="text-xs text-muted-foreground">{stage.label}</span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {stage.value}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PublishedCounters({ lastHour, today }: { lastHour: number; today: number }) {
  const counters = [
    { key: 'hour', label: 'Published last hour', value: lastHour },
    { key: 'today', label: 'Published today', value: today },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3">
      {counters.map((counter) => (
        <div key={counter.key} className="rounded-lg border border-border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{counter.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {counter.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RunningNowPanel({ running, now }: { running: LiveRun[]; now: number }) {
  return (
    <section aria-label="Running now" className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <h3 className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Running now
        </h3>
      </div>
      {running.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Nothing is running at this moment. Agents pick up work on their schedule.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {running.map((run) => (
            <li
              key={run.runId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <span className="truncate font-medium text-foreground">{run.agentName}</span>
              <span className="text-xs text-muted-foreground">{roleLabel(run.role)}</span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                <WorkingDot />
                {formatElapsed(run.startedAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading live agent activity</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SKELETON_CARDS.map((cardKey) => (
          <div
            key={cardKey}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

export default function AgentLiveBoard() {
  const [snapshot, setSnapshot] = useState<AgentLiveSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const snapshotRef = useRef<AgentLiveSnapshot | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'poll') => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    if (mode === 'initial' && snapshotRef.current === null) {
      setStatus('loading');
      setLoadError(null);
    }

    try {
      const payload = await requestJson<AgentLiveSnapshot>(LIVE_ENDPOINT, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      snapshotRef.current = payload;
      setSnapshot(payload);
      setStatus('ready');
      setIsStale(false);
      setLoadError(null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      if (snapshotRef.current === null) {
        setLoadError(toErrorMessage(error));
        setStatus('error');
      } else {
        setIsStale(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        inFlightRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    void load('initial');

    const intervalId = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      void load('poll');
    }, POLL_MS);

    const handleVisibility = () => {
      if (!document.hidden) {
        void load('poll');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [load]);

  if (status === 'loading' && snapshot === null) {
    return <BoardSkeleton />;
  }

  if (status === 'error' && snapshot === null) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
        <TriangleAlertIcon className="size-8 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load live activity</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          onClick={() => void load('initial')}
        >
          <RefreshCwIcon />
          Retry
        </Button>
      </div>
    );
  }

  if (snapshot === null) {
    return null;
  }

  const now = Date.now();
  const { running, nextRuns, pipeline, recent, publishedLastHour, publishedToday } = snapshot;
  const runningByAgent = new Map(running.map((run) => [run.agentId, run]));
  const isEmpty = running.length === 0 && nextRuns.length === 0 && recent.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
        <BotIcon className="size-8 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">No agent activity yet</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Once you configure an agent it will appear here the moment it starts working.
          </p>
        </div>
        <Button asChild className="whitespace-nowrap">
          <a href="/dashboard/agents">Set up agents</a>
        </Button>
      </div>
    );
  }

  const runningSummary =
    running.length === 0
      ? 'No agents are running right now.'
      : `${running.length} ${running.length === 1 ? 'agent is' : 'agents are'} running: ${running
          .map((run) => run.agentName)
          .join(', ')}.`;

  return (
    <section aria-label="Live agent activity" className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {runningSummary}
      </p>

      {isStale ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Live updates paused. Showing the last update received.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => void load('poll')}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nextRuns.map((agent) => (
          <AgentStateCard
            key={agent.agentId}
            agent={agent}
            running={runningByAgent.get(agent.agentId)}
            now={now}
          />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineStrip pipeline={pipeline} />
        </div>
        <PublishedCounters lastHour={publishedLastHour} today={publishedToday} />
      </div>

      <RunningNowPanel running={running} now={now} />
    </section>
  );
}
