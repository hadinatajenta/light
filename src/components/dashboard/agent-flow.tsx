import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { requestJson, toErrorMessage } from './api-client';

type StageId = 'planner' | 'researcher' | 'writer' | 'qc' | 'reviewer' | 'published';

interface FlowAgent {
  id: string;
  name: string;
  role: string;
  runsPerDay: number;
  cadenceLabel: string;
  running: boolean;
  nextRunAt: string | null;
  enabled: boolean;
}

interface FlowStage {
  id: StageId;
  label: string;
  description: string;
  waiting: number;
  active: number;
  doneToday: number;
  agents: FlowAgent[];
}

interface AgentFlowSnapshot {
  generatedAt: string;
  stages: FlowStage[];
}

type LoadMode = 'initial' | 'poll' | 'manual';

const FLOW_ENDPOINT = '/api/dashboard/agents/flow';
const POLL_MS = 15_000;
const STAGE_ORDER = 'planner, researcher, writer, qc, reviewer, published';
const SKELETON_STAGES = [
  'agent-flow-skeleton-1',
  'agent-flow-skeleton-2',
  'agent-flow-skeleton-3',
  'agent-flow-skeleton-4',
];

function WorkingDot() {
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
      <span className="absolute inline-flex size-full animate-pulse rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex w-16 shrink-0 items-center justify-center self-center"
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      {active ? (
        <span className="animate-flow absolute top-1/2 left-0 -mt-1 size-2 rounded-full bg-primary motion-reduce:animate-none" />
      ) : null}
    </div>
  );
}

function StageCard({ stage }: { stage: FlowStage }) {
  const backlog = stage.waiting + stage.active;
  const hasAgents = stage.agents.length > 0;

  return (
    <article className="flex w-60 shrink-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {stage.label}
      </h3>

      {hasAgents ? (
        <>
          <div>
            <span className="block text-3xl font-semibold text-foreground tabular-nums">
              {backlog}
            </span>
            <span className="text-xs text-muted-foreground">backlog</span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {stage.waiting} waiting · {stage.active} in progress · {stage.doneToday} done today
          </p>
        </>
      ) : (
        <div>
          <span className="block text-3xl font-semibold text-foreground tabular-nums">
            {stage.doneToday}
          </span>
          <span className="text-xs text-muted-foreground">done today</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{stage.description}</p>

      {hasAgents ? (
        <ul className="mt-auto flex flex-col gap-2">
          {stage.agents.map((agent) => (
            <li key={agent.id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                {agent.running ? (
                  <WorkingDot />
                ) : (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate text-sm text-foreground" title={agent.name}>
                  {agent.name}
                </span>
                {agent.running ? <span className="sr-only">working now</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{agent.cadenceLabel}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function FlowSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading the agent pipeline flow</span>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {SKELETON_STAGES.map((cardKey) => (
          <div
            key={cardKey}
            className="flex w-60 shrink-0 flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AgentFlow() {
  const [snapshot, setSnapshot] = useState<AgentFlowSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const snapshotRef = useRef<AgentFlowSnapshot | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async (mode: LoadMode) => {
    if (mode !== 'manual' && inFlightRef.current) {
      return;
    }

    if (mode === 'manual') {
      abortRef.current?.abort();
    }

    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    if (mode === 'manual') {
      setIsRefreshing(true);
    }

    if (mode === 'initial' && snapshotRef.current === null) {
      setStatus('loading');
      setLoadError(null);
    }

    try {
      const payload = await requestJson<AgentFlowSnapshot>(FLOW_ENDPOINT, {
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
        setIsRefreshing(false);
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
    return <FlowSkeleton />;
  }

  if (status === 'error' && snapshot === null) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
        <TriangleAlertIcon className="size-8 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load the pipeline flow</p>
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
  const runningCount = snapshot.stages.reduce(
    (total, stage) => total + stage.agents.filter((agent) => agent.running).length,
    0,
  );
  const isIdle =
    snapshot.stages.length === 0 ||
    snapshot.stages.every(
      (stage) => stage.waiting === 0 && stage.active === 0 && stage.doneToday === 0,
    );

  const runningSummary =
    runningCount === 0
      ? 'No agents are working now.'
      : `${runningCount} ${runningCount === 1 ? 'agent is' : 'agents are'} working now.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Pipeline flow
          </h2>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {runningSummary} Updated {formatRelativeTime(snapshot.generatedAt, now)}.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          disabled={isRefreshing}
          onClick={() => void load('manual')}
        >
          <RefreshCwIcon className={cn(isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {runningSummary}
      </p>

      {isStale ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Live updates paused. Showing the last flow received.
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

      {isIdle ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">The pipeline is idle</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Nothing is queued, in progress, or published today. Run an agent to move work through
            the stages, or wait for the schedule to pick up the next run.
          </p>
        </div>
      ) : null}

      <section aria-label="Agent pipeline stages" className="flex flex-col gap-2">
        <p className="max-w-prose text-sm text-muted-foreground">
          Stages run in order: {STAGE_ORDER}. QC and the reviewer both pull from the same pending
          drafts.
        </p>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-stretch gap-0">
            {snapshot.stages.map((stage, index) => (
              <Fragment key={stage.id}>
                <StageCard stage={stage} />
                {index < snapshot.stages.length - 1 ? (
                  <Connector active={stage.waiting + stage.active > 0} />
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
