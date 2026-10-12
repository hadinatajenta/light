import {
  BotIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { requestJson, toErrorMessage } from './api-client';

const AGENTS_ENDPOINT = '/api/dashboard/agents';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SKELETON_CARDS = ['agent-skeleton-1', 'agent-skeleton-2'];

type AgentRole = 'writer' | 'reviewer' | 'qc' | 'scrapper';

interface AgentRecord {
  id: string;
  name: string;
  role: AgentRole;
  prompt: string;
  model: string;
  runsPerDay: number;
  enabled: boolean;
  autoPublish: boolean;
  category: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RoleDefinition {
  id: AgentRole;
  label: string;
  description: string;
  defaultEffort: 'low' | 'high' | 'max';
  canAutoPublish: boolean;
  defaultPrompt: string;
}

interface AgentsMeta {
  roles: RoleDefinition[];
  models: string[];
  maxAgents: number;
  minRunsPerDay: number;
  maxRunsPerDay: number;
  defaultModel: string;
  deepseek: { configured: boolean; hint: string | null };
}

interface AgentRunResult {
  runId: string;
  status: 'succeeded' | 'failed' | 'skipped';
  summary: string;
  output: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  error?: string;
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return 'Never';
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Unknown';
  }
  const difference = Date.now() - timestamp;
  const distance = Math.abs(difference);
  if (distance < MINUTE_MS) {
    return 'Just now';
  }
  if (distance < HOUR_MS) {
    const minutes = Math.round(distance / MINUTE_MS);
    return difference >= 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }
  if (distance < DAY_MS) {
    const hours = Math.round(distance / HOUR_MS);
    return difference >= 0 ? `${hours}h ago` : `in ${hours}h`;
  }
  const days = Math.round(distance / DAY_MS);
  return difference >= 0 ? `${days}d ago` : `in ${days}d`;
}

function StatusIndicator({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        enabled ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', enabled ? 'bg-primary' : 'bg-muted-foreground')}
        aria-hidden="true"
      />
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <Skeleton className="h-5 w-20 rounded-full" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

interface AgentCardProps {
  agent: AgentRecord;
  roleLabel: string;
  isRunning: boolean;
  isToggling: boolean;
  onRun: (agent: AgentRecord) => void;
  onToggle: (agent: AgentRecord) => void;
}

function AgentCard({ agent, roleLabel, isRunning, isToggling, onRun, onToggle }: AgentCardProps) {
  const isBusy = isRunning || isToggling;

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="w-fit text-[0.625rem] tracking-[0.08em] uppercase text-muted-foreground"
          >
            {roleLabel}
          </Badge>
          {agent.role === 'writer' && agent.category ? (
            <span className="font-mono text-xs text-muted-foreground">{agent.category}</span>
          ) : null}
        </div>
        <h3 className="truncate text-base font-semibold text-foreground" title={agent.name}>
          {agent.name}
        </h3>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {agent.model} · {agent.runsPerDay}x per day
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {agent.lastRunAt ? `Last run ${formatRelativeTime(agent.lastRunAt)}` : 'Never run'}
        </span>
        <StatusIndicator enabled={agent.enabled} />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="whitespace-nowrap"
          aria-pressed={agent.enabled}
          disabled={isBusy}
          onClick={() => onToggle(agent)}
        >
          {isToggling ? <Loader2Icon className="animate-spin" /> : null}
          {agent.enabled ? 'Disable' : 'Enable'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          disabled={isBusy}
          aria-label={`Run ${agent.name} now`}
          onClick={() => onRun(agent)}
        >
          {isRunning ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          {isRunning ? 'Running' : 'Run agent'}
        </Button>
        <Button asChild variant="ghost" size="sm" className="whitespace-nowrap">
          <a href={`/dashboard/agents/${encodeURIComponent(agent.id)}/edit`}>
            <PencilIcon />
            Edit
          </a>
        </Button>
      </div>
    </article>
  );
}

export default function AgentList() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [meta, setMeta] = useState<AgentsMeta | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const loadAgents = useCallback(async (isSilent = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (isSilent) {
      setIsRefreshing(true);
    } else {
      setStatus('loading');
    }
    setLoadError(null);

    try {
      const payload = await requestJson<{ agents: AgentRecord[]; meta: AgentsMeta }>(
        AGENTS_ENDPOINT,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setAgents(payload.agents);
      setMeta(payload.meta);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      if (!isSilent) {
        setStatus('error');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAgents(false);
    return () => controllerRef.current?.abort();
  }, [loadAgents]);

  const roleLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const role of meta?.roles ?? []) {
      labels.set(role.id, role.label);
    }
    return labels;
  }, [meta]);

  const handleRun = async (agent: AgentRecord) => {
    if (runningId !== null || togglingId !== null) {
      return;
    }
    setRunningId(agent.id);
    try {
      const payload = await requestJson<{ result: AgentRunResult }>(
        `${AGENTS_ENDPOINT}/${encodeURIComponent(agent.id)}/run`,
        { method: 'POST' },
      );
      if (payload.result.status === 'succeeded') {
        toast.success(payload.result.summary);
      } else if (payload.result.status === 'skipped') {
        toast(payload.result.summary);
      } else {
        toast.error(payload.result.error ?? payload.result.summary);
      }
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setRunningId(null);
      void loadAgents(true);
    }
  };

  const handleToggle = async (agent: AgentRecord) => {
    if (runningId !== null || togglingId !== null) {
      return;
    }
    const nextEnabled = !agent.enabled;
    setTogglingId(agent.id);
    setAgents((current) =>
      current.map((entry) => (entry.id === agent.id ? { ...entry, enabled: nextEnabled } : entry)),
    );

    try {
      await requestJson<{ agent: AgentRecord }>(
        `${AGENTS_ENDPOINT}/${encodeURIComponent(agent.id)}/status`,
        { method: 'POST', body: JSON.stringify({ enabled: nextEnabled }) },
      );
      toast.success(nextEnabled ? `Enabled ${agent.name}.` : `Disabled ${agent.name}.`);
    } catch (error) {
      setAgents((current) =>
        current.map((entry) =>
          entry.id === agent.id ? { ...entry, enabled: agent.enabled } : entry,
        ),
      );
      toast.error(toErrorMessage(error));
    } finally {
      setTogglingId(null);
      void loadAgents(true);
    }
  };

  const maxAgents = meta?.maxAgents ?? 0;
  const isAtLimit = meta !== null && agents.length >= maxAgents;
  const showSkeleton = status === 'loading' && agents.length === 0;
  const showErrorState = status === 'error' && agents.length === 0;
  const showEmpty = status === 'ready' && agents.length === 0;
  const showInlineError = loadError !== null && agents.length > 0;

  return (
    <section className="flex flex-col gap-4" aria-label="Agents">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
              Agents
            </h2>
            {meta ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {agents.length} of {meta.maxAgents}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Automate drafting, review, quality checks, and research on a schedule.
          </p>
        </div>

        <div className="flex flex-col items-start gap-1 sm:items-end">
          {isAtLimit ? (
            <Button type="button" disabled className="whitespace-nowrap">
              <PlusIcon />
              New agent
            </Button>
          ) : (
            <Button asChild className="whitespace-nowrap">
              <a href="/dashboard/agents/new">
                <PlusIcon />
                New agent
              </a>
            </Button>
          )}
          {isAtLimit ? (
            <p className="text-xs text-muted-foreground">
              You reached the limit of {maxAgents} agents. Delete one to add another.
            </p>
          ) : null}
        </div>
      </div>

      {showInlineError ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlertIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{loadError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadAgents(true)}
            disabled={isRefreshing}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {showSkeleton ? (
        <div role="status" aria-live="polite" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <span className="sr-only">Loading agents</span>
          {SKELETON_CARDS.map((cardKey) => (
            <AgentCardSkeleton key={cardKey} />
          ))}
        </div>
      ) : null}

      {showErrorState ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <TriangleAlertIcon className="size-8 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load agents</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadAgents(false)}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : null}

      {showEmpty ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <BotIcon className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No agents yet</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Agents run your content pipeline on a schedule. Each role does a different job:
            </p>
          </div>
          <ul className="grid w-full gap-3 sm:grid-cols-2">
            {(meta?.roles ?? []).map((role) => (
              <li key={role.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{role.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
              </li>
            ))}
          </ul>
          <Button asChild className="whitespace-nowrap">
            <a href="/dashboard/agents/new">
              <PlusIcon />
              New agent
            </a>
          </Button>
        </div>
      ) : null}

      {agents.length > 0 ? (
        <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2', isRefreshing && 'opacity-70')}>
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              roleLabel={roleLabels.get(agent.role) ?? agent.role}
              isRunning={runningId === agent.id}
              isToggling={togglingId === agent.id}
              onRun={(target) => void handleRun(target)}
              onToggle={(target) => void handleToggle(target)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
