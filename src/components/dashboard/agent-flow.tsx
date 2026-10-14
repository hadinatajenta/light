import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AgentFlowSnapshot,
  type FlowStage,
  ORDER_STAGE_IDS,
  type StageId,
} from '@/components/dashboard/agent-flow-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import AgentFlowDetailSheet from './agent-flow-detail-sheet';
import { requestJson, toErrorMessage } from './api-client';

interface MainEdge {
  fromIndex: number;
  toIndex: number;
  label: string;
  upstream: StageId;
}

interface FeedbackEdge {
  fromIndex: number;
  toIndex: number;
  laneY: number;
  label: string;
  sourceOffset: number;
  targetOffset: number;
  source: StageId;
}

type LoadMode = 'initial' | 'poll' | 'manual';

const FLOW_ENDPOINT = '/api/dashboard/agents/flow';
const POLL_MS = 15_000;
const STAGE_ORDER = 'planner, researcher, writer, qc, reviewer, published';
const SKELETON_NODE_KEYS = [
  'agent-flow-node-1',
  'agent-flow-node-2',
  'agent-flow-node-3',
  'agent-flow-node-4',
  'agent-flow-node-5',
  'agent-flow-node-6',
];

const DIAGRAM_WIDTH = 880;
const DIAGRAM_HEIGHT = 240;
const NODE_WIDTH = 100;
const NODE_HEIGHT = 64;
const NODE_START_X = 20;
const NODE_STEP = 148;
const NODE_TOP = 44;
const NODE_BOTTOM = NODE_TOP + NODE_HEIGHT;
const NODE_CENTER_Y = NODE_TOP + NODE_HEIGHT / 2;
const LANE_UPPER_Y = 148;
const LANE_LOWER_Y = 190;
const AGENT_LINE_MAX_LENGTH = 24;

const MAIN_EDGES: MainEdge[] = [
  { fromIndex: 0, toIndex: 1, label: 'topics', upstream: 'planner' },
  { fromIndex: 1, toIndex: 2, label: 'notes', upstream: 'researcher' },
  { fromIndex: 2, toIndex: 3, label: 'draft', upstream: 'writer' },
  { fromIndex: 3, toIndex: 4, label: 'gate', upstream: 'qc' },
  { fromIndex: 4, toIndex: 5, label: 'approve', upstream: 'reviewer' },
];

const FEEDBACK_EDGES: FeedbackEdge[] = [
  {
    fromIndex: 4,
    toIndex: 2,
    laneY: LANE_UPPER_Y,
    label: 'changes requested',
    sourceOffset: 18,
    targetOffset: -26,
    source: 'writer',
  },
  {
    fromIndex: 2,
    toIndex: 1,
    laneY: LANE_LOWER_Y,
    label: 'needs research',
    sourceOffset: 26,
    targetOffset: -22,
    source: 'researcher',
  },
];

function nodeCenterX(index: number): number {
  return NODE_START_X + index * NODE_STEP + NODE_WIDTH / 2;
}

function buildCountLine(stage: FlowStage): string {
  const parts: string[] = [];

  if (stage.waiting > 0) {
    parts.push(`${stage.waiting} waiting`);
  }
  if (stage.active > 0) {
    parts.push(`${stage.active} active`);
  }

  return parts.join(' · ');
}

function buildAgentLine(stage: FlowStage): string {
  const joined = stage.agents.map((agent) => `${agent.name} · ${agent.cadenceLabel}`).join(', ');

  if (joined.length <= AGENT_LINE_MAX_LENGTH) {
    return joined;
  }

  return `${joined.slice(0, AGENT_LINE_MAX_LENGTH - 1)}…`;
}

function buildAccessibleStage(stage: FlowStage): string {
  const counts = `${stage.waiting} waiting, ${stage.active} in progress, ${stage.doneToday} done today, ${stage.bounced} bounced`;

  if (stage.agents.length === 0) {
    return `${stage.label}: ${counts}.`;
  }

  const agents = stage.agents
    .map((agent) => `${agent.name}, ${agent.cadenceLabel}${agent.running ? ', working now' : ''}`)
    .join('; ');

  return `${stage.label}: ${counts}. Agents: ${agents}.`;
}

function hasUpstreamWork(stage: FlowStage | undefined): boolean {
  if (!stage) {
    return false;
  }

  return stage.waiting + stage.active > 0 || stage.doneToday > 0 || isStageRunning(stage);
}

function hasBacklog(stage: FlowStage | undefined): boolean {
  if (!stage) {
    return false;
  }

  return stage.waiting + stage.active > 0;
}

function hasBounce(stage: FlowStage | undefined): boolean {
  if (!stage) {
    return false;
  }

  return stage.bounced > 0;
}

function isStageRunning(stage: FlowStage): boolean {
  return stage.agents.some((agent) => agent.running);
}

function FlowSkeleton() {
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-3">
      <span className="sr-only">Loading the agent pipeline flow</span>

      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-20" />
      </div>

      <Skeleton className="mt-2 h-3 w-3/4" />

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SKELETON_NODE_KEYS.map((nodeKey) => (
          <Skeleton key={nodeKey} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function StageNode({
  stage,
  index,
  isSelected,
  onSelect,
}: {
  stage: FlowStage;
  index: number;
  isSelected: boolean;
  onSelect: (stageId: StageId) => void;
}) {
  const countLine = buildCountLine(stage);
  const agentLine = buildAgentLine(stage);
  const running = isStageRunning(stage);
  const backlog = hasBacklog(stage);

  return (
    <li
      className="absolute"
      style={{
        left: `${((NODE_START_X + index * NODE_STEP) / DIAGRAM_WIDTH) * 100}%`,
        top: `${(NODE_TOP / DIAGRAM_HEIGHT) * 100}%`,
        width: `${(NODE_WIDTH / DIAGRAM_WIDTH) * 100}%`,
        height: `${(NODE_HEIGHT / DIAGRAM_HEIGHT) * 100}%`,
      }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isSelected}
        aria-label={`${stage.label}: ${stage.waiting} waiting, ${stage.active} in progress, ${stage.doneToday} done today. Show stage detail.`}
        onClick={() => onSelect(stage.id)}
        className={cn(
          'relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[10px] border bg-card px-1 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          isSelected ? 'border-primary' : 'border-border',
        )}
      >
        {running ? (
          <span
            className="absolute top-1 right-1 size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : backlog ? (
          <span
            className="absolute top-1 right-1 size-2 rounded-full border border-dashed border-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
        <span className="text-[11px] font-semibold text-foreground">{stage.label}</span>
        {countLine ? (
          <span className="text-[9px] text-muted-foreground tabular-nums">{countLine}</span>
        ) : null}
        {agentLine ? <span className="text-[8px] text-muted-foreground">{agentLine}</span> : null}
      </button>
    </li>
  );
}

function FlowDiagram({
  stages,
  selectedStageId,
  onSelectStage,
}: {
  stages: FlowStage[];
  selectedStageId: StageId | null;
  onSelectStage: (stageId: StageId) => void;
}) {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const stageAt = (index: number): FlowStage | undefined => stageById.get(ORDER_STAGE_IDS[index]);

  return (
    <div className="relative mx-auto aspect-[880/240] w-full max-w-[880px]">
      <svg
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="agent-flow-arrow"
            viewBox="0 0 8 8"
            refX={8}
            refY={4}
            markerWidth={8}
            markerHeight={8}
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {FEEDBACK_EDGES.map((edge) => {
          const startX = nodeCenterX(edge.fromIndex) + edge.sourceOffset;
          const endX = nodeCenterX(edge.toIndex) + edge.targetOffset;
          const path = `M ${startX} ${NODE_BOTTOM} V ${edge.laneY} H ${endX} V ${NODE_BOTTOM}`;
          const animated = hasBounce(stageAt(edge.fromIndex));
          const labelX = (startX + endX) / 2;

          return (
            <g key={`${edge.fromIndex}-${edge.toIndex}`}>
              <path
                d={path}
                fill="none"
                className={cn(
                  'stroke-muted-foreground',
                  animated && 'animate-flow-dash motion-reduce:animate-none',
                )}
                strokeWidth={1.25}
                strokeDasharray="6 10"
                strokeLinejoin="round"
                markerEnd="url(#agent-flow-arrow)"
              />
              <text
                x={labelX}
                y={edge.laneY - 5}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {edge.label}
              </text>
            </g>
          );
        })}

        {MAIN_EDGES.map((edge) => {
          const startX = nodeCenterX(edge.fromIndex) + NODE_WIDTH / 2;
          const endX = nodeCenterX(edge.toIndex) - NODE_WIDTH / 2;
          const animated = hasUpstreamWork(stageAt(edge.fromIndex));
          const labelX = (startX + endX) / 2;

          return (
            <g key={`${edge.fromIndex}-${edge.toIndex}`}>
              <line
                x1={startX}
                y1={NODE_CENTER_Y}
                x2={endX}
                y2={NODE_CENTER_Y}
                className="stroke-muted-foreground"
                strokeWidth={1.25}
                markerEnd="url(#agent-flow-arrow)"
              />
              {animated ? (
                <line
                  x1={startX}
                  y1={NODE_CENTER_Y}
                  x2={endX}
                  y2={NODE_CENTER_Y}
                  className="animate-flow-dash stroke-primary motion-reduce:animate-none"
                  strokeWidth={1.25}
                  strokeDasharray="6 10"
                />
              ) : null}
              <text
                x={labelX}
                y={NODE_CENTER_Y - 7}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {edge.label}
              </text>
            </g>
          );
        })}
      </svg>

      <ul aria-label="Pipeline stages" className="absolute inset-0">
        {ORDER_STAGE_IDS.map((stageId, index) => {
          const stage = stageById.get(stageId);
          if (!stage) {
            return null;
          }

          return (
            <StageNode
              key={stage.id}
              stage={stage}
              index={index}
              isSelected={selectedStageId === stage.id}
              onSelect={onSelectStage}
            />
          );
        })}
      </ul>
    </div>
  );
}

export default function AgentFlow() {
  const [snapshot, setSnapshot] = useState<AgentFlowSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<StageId | null>(null);
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

  const handleSelectStage = useCallback((stageId: StageId) => {
    setSelectedStageId(stageId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedStageId(null);
  }, []);

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
      ? 'No agents working now'
      : `${runningCount} ${runningCount === 1 ? 'agent' : 'agents'} working now`;

  return (
    <section
      aria-label="Agent pipeline stages"
      className="rounded-xl border border-border bg-card p-3"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {runningSummary}.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
          <h2 className="text-sm font-medium text-foreground">Live topology playground</h2>
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

      <p className="mt-1 text-xs text-muted-foreground">
        Stages run in order: {STAGE_ORDER}. Click a stage to inspect it. QC and the reviewer both
        claim from the same pending drafts. A solid arrow animates while work is moving out of that
        stage, a dashed arrow is work sent back, a pulsing dot means an agent is running now, and a
        dashed ring means the stage is holding a backlog.
      </p>

      {isStale ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
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
        <p className="mt-2 text-xs text-muted-foreground">
          The pipeline is idle. Run an agent to move work through the stages, or wait for the
          schedule to pick up the next run.
        </p>
      ) : null}

      <div className="mt-3">
        <FlowDiagram
          stages={snapshot.stages}
          selectedStageId={selectedStageId}
          onSelectStage={handleSelectStage}
        />
      </div>

      <AgentFlowDetailSheet stageId={selectedStageId} onClose={handleCloseDetail} />

      <ol className="sr-only">
        {ORDER_STAGE_IDS.map((stageId) => {
          const stage = snapshot.stages.find((entry) => entry.id === stageId);
          if (!stage) {
            return null;
          }

          return <li key={stage.id}>{buildAccessibleStage(stage)}</li>;
        })}
      </ol>
    </section>
  );
}
