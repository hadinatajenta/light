import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { requestJson, toErrorMessage } from './api-client';

type StageId = 'planner' | 'researcher' | 'writer' | 'qc' | 'reviewer' | 'published';

type StageState = 'running' | 'backlog' | 'idle';

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
const SKELETON_ROWS = [
  'agent-flow-skeleton-1',
  'agent-flow-skeleton-2',
  'agent-flow-skeleton-3',
  'agent-flow-skeleton-4',
  'agent-flow-skeleton-5',
  'agent-flow-skeleton-6',
];

function WorkingDot() {
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
      <span className="absolute inline-flex size-full animate-pulse rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  );
}

function StageStatusDot({ state }: { state: StageState }) {
  if (state === 'running') {
    return <WorkingDot />;
  }

  if (state === 'backlog') {
    return (
      <span className="inline-flex size-2 rounded-full bg-muted-foreground" aria-hidden="true" />
    );
  }

  return (
    <span className="inline-flex size-2 rounded-full border border-border" aria-hidden="true" />
  );
}

function StageRail({
  state,
  isFirst,
  isLast,
  animated,
}: {
  state: StageState;
  isFirst: boolean;
  isLast: boolean;
  animated: boolean;
}) {
  return (
    <div className="relative flex w-6 shrink-0 justify-center self-stretch">
      {isFirst ? null : (
        <span
          aria-hidden="true"
          className="absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-border"
        />
      )}

      {isLast ? null : (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-border"
        />
      )}

      {animated && !isLast ? (
        <span className="animate-flow-line absolute top-1/2 left-1/2 size-1.5 rounded-full bg-primary motion-reduce:animate-none motion-reduce:hidden" />
      ) : null}

      <span className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <StageStatusDot state={state} />
      </span>
    </div>
  );
}

function AgentChips({ agents }: { agents: FlowAgent[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-1">
      {agents.map((agent) => (
        <li
          key={agent.id}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-xs"
        >
          {agent.running ? <WorkingDot /> : null}
          <span className="max-w-[9rem] truncate text-foreground" title={agent.name}>
            {agent.name}
          </span>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="text-muted-foreground tabular-nums">{agent.cadenceLabel}</span>
          {agent.running ? <span className="sr-only">working now</span> : null}
        </li>
      ))}
    </ul>
  );
}

function stageState(stage: FlowStage): StageState {
  if (stage.active > 0 || stage.agents.some((agent) => agent.running)) {
    return 'running';
  }

  if (stage.waiting > 0) {
    return 'backlog';
  }

  return 'idle';
}

function buildMetrics(stage: FlowStage): string {
  const parts: string[] = [];

  if (stage.waiting > 0) {
    parts.push(`${stage.waiting} waiting`);
  }
  if (stage.active > 0) {
    parts.push(`${stage.active} in progress`);
  }
  if (stage.doneToday > 0) {
    parts.push(`${stage.doneToday} done today`);
  }

  return parts.join(' · ');
}

function StageRow({
  stage,
  isFirst,
  isLast,
}: {
  stage: FlowStage;
  isFirst: boolean;
  isLast: boolean;
}) {
  const state = stageState(stage);
  const metrics = buildMetrics(stage);
  const upstreamActive = stage.waiting + stage.active > 0;

  return (
    <li className="flex min-h-10 items-stretch gap-3 py-1">
      <StageRail state={state} isFirst={isFirst} isLast={isLast} animated={upstreamActive} />

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{stage.label}</span>
          {metrics ? (
            <span className="text-xs text-muted-foreground tabular-nums">{metrics}</span>
          ) : null}
          {state === 'running' ? <span className="sr-only">working now</span> : null}
        </div>

        {stage.agents.length > 0 ? <AgentChips agents={stage.agents} /> : null}
      </div>
    </li>
  );
}

function FlowSkeleton() {
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-2">
      <span className="sr-only">Loading the agent pipeline flow</span>

      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-20" />
      </div>

      <Skeleton className="mt-0.5 h-3 w-3/4" />

      <div className="mt-0.5 flex flex-col">
        {SKELETON_ROWS.map((rowKey) => (
          <div key={rowKey} className="flex min-h-10 items-center gap-3 py-1">
            <div className="flex w-6 shrink-0 justify-center">
              <Skeleton className="size-2.5 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="ml-auto h-5 w-28" />
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
    <section
      aria-label="Agent pipeline stages"
      className="rounded-xl border border-border bg-card p-2"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {runningSummary}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
          <h2 className="text-sm font-medium text-foreground">Pipeline</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{runningSummary}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            Updated {formatRelativeTime(snapshot.generatedAt, now)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="whitespace-nowrap"
          disabled={isRefreshing}
          onClick={() => void load('manual')}
        >
          <RefreshCwIcon className={cn(isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <p className="mt-0.5 text-xs text-muted-foreground">
        Stages run in order: {STAGE_ORDER}. QC and the reviewer both pull from the same pending
        drafts.
      </p>

      {isStale ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Live updates paused. Showing the last flow received.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="whitespace-nowrap"
            onClick={() => void load('poll')}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {isIdle ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          The pipeline is idle. Run an agent to move work through the stages, or wait for the
          schedule to pick up the next run.
        </p>
      ) : null}

      <ol className="mt-0.5 flex flex-col">
        {snapshot.stages.map((stage, index) => (
          <StageRow
            key={stage.id}
            stage={stage}
            isFirst={index === 0}
            isLast={index === snapshot.stages.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}
