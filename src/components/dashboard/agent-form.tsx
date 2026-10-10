import {
  ArrowLeftIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError, requestJson, toErrorMessage } from './api-client';

const AGENTS_ENDPOINT = '/api/dashboard/agents';
const PROMPT_ROWS = 10;

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

type AgentRole = 'writer' | 'reviewer' | 'qc' | 'scrapper';
type AgentFormMode = 'create' | 'edit';
type RunStatus = 'running' | 'succeeded' | 'failed';

interface AgentRecord {
  id: string;
  name: string;
  role: AgentRole;
  prompt: string;
  model: string;
  runsPerDay: number;
  enabled: boolean;
  autoPublish: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentRunRecord {
  id: string;
  agentId: string;
  status: RunStatus;
  summary: string | null;
  output: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
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

interface AgentInput {
  name: string;
  role: AgentRole;
  prompt: string;
  model: string;
  runsPerDay: number;
  enabled: boolean;
  autoPublish: boolean;
}

interface AgentFormValues {
  name: string;
  role: AgentRole;
  prompt: string;
  model: string;
  runsPerDay: string;
  enabled: boolean;
  autoPublish: boolean;
}

interface AgentFormProps {
  mode: AgentFormMode;
  agentId?: string;
}

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
};

const RUN_STATUS_VARIANT: Record<RunStatus, 'default' | 'secondary' | 'destructive'> = {
  running: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
};

function mapFieldErrors(details: unknown): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (!details || typeof details !== 'object') {
    return mapped;
  }
  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) {
    return mapped;
  }
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') {
      continue;
    }
    const field = (issue as { field?: unknown }).field;
    const message = (issue as { message?: unknown }).message;
    if (typeof field !== 'string' || typeof message !== 'string') {
      continue;
    }
    const key = field.split('.').pop() ?? field;
    if (!mapped[key]) {
      mapped[key] = message;
    }
  }
  return mapped;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }
  return parsed.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatTokens(tokensIn: number | null, tokensOut: number | null): string {
  if (tokensIn === null && tokensOut === null) {
    return 'No token data';
  }
  return `${tokensIn ?? 0} in · ${tokensOut ?? 0} out`;
}

function createDefaultValues(meta: AgentsMeta): AgentFormValues {
  const defaultRole = meta.roles[0];
  return {
    name: '',
    role: defaultRole?.id ?? 'writer',
    prompt: defaultRole?.defaultPrompt ?? '',
    model: meta.defaultModel,
    runsPerDay: String(meta.minRunsPerDay),
    enabled: true,
    autoPublish: false,
  };
}

function toFormValues(agent: AgentRecord): AgentFormValues {
  return {
    name: agent.name,
    role: agent.role,
    prompt: agent.prompt,
    model: agent.model,
    runsPerDay: String(agent.runsPerDay),
    enabled: agent.enabled,
    autoPublish: agent.autoPublish,
  };
}

function AgentFormSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-6 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <span className="sr-only">Loading agent</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-52 w-full" />
      </div>
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

export default function AgentForm({ mode, agentId }: AgentFormProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<AgentsMeta | null>(null);
  const [runs, setRuns] = useState<AgentRunRecord[]>([]);
  const [values, setValues] = useState<AgentFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const promptTouchedRef = useRef(false);

  const loadData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setLoadError(null);

    try {
      const metaPayload = await requestJson<{ agents: AgentRecord[]; meta: AgentsMeta }>(
        AGENTS_ENDPOINT,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }

      if (mode === 'edit') {
        if (!agentId) {
          throw new ApiRequestError(404, 'AGENT_NOT_FOUND', 'That agent does not exist.');
        }
        const detail = await requestJson<{ agent: AgentRecord; runs: AgentRunRecord[] }>(
          `${AGENTS_ENDPOINT}/${encodeURIComponent(agentId)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) {
          return;
        }
        setRuns(detail.runs);
        setValues(toFormValues(detail.agent));
      } else {
        setValues(createDefaultValues(metaPayload.meta));
      }

      promptTouchedRef.current = false;
      setMeta(metaPayload.meta);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, [mode, agentId]);

  useEffect(() => {
    void loadData();
    return () => controllerRef.current?.abort();
  }, [loadData]);

  const roleDefinitions = useMemo(() => meta?.roles ?? [], [meta]);
  const activeRole = useMemo(
    () => roleDefinitions.find((role) => role.id === values?.role),
    [roleDefinitions, values?.role],
  );
  const isReviewer = values?.role === 'reviewer';

  const handleRoleChange = (nextRole: AgentRole) => {
    setValues((current) => {
      if (!current) {
        return current;
      }
      const nextRoleDefinition = roleDefinitions.find((role) => role.id === nextRole);
      const shouldPrefill = !promptTouchedRef.current && nextRoleDefinition !== undefined;
      return {
        ...current,
        role: nextRole,
        prompt: shouldPrefill ? nextRoleDefinition.defaultPrompt : current.prompt,
        autoPublish: nextRole === 'reviewer' ? current.autoPublish : false,
      };
    });
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || values === null) {
      return;
    }

    const runsPerDay = Number.parseInt(values.runsPerDay, 10);
    const payload: AgentInput = {
      name: values.name.trim(),
      role: values.role,
      prompt: values.prompt,
      model: values.model,
      runsPerDay: Number.isNaN(runsPerDay) ? 0 : runsPerDay,
      enabled: values.enabled,
      autoPublish: values.role === 'reviewer' ? values.autoPublish : false,
    };

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      if (mode === 'edit' && agentId) {
        await requestJson<{ agent: AgentRecord }>(
          `${AGENTS_ENDPOINT}/${encodeURIComponent(agentId)}`,
          { method: 'PUT', body: JSON.stringify(payload) },
        );
        toast.success(`Saved ${payload.name}.`);
      } else {
        await requestJson<{ agent: AgentRecord }>(AGENTS_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created ${payload.name}.`);
      }
      window.location.href = '/dashboard/agents';
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFieldErrors(mapFieldErrors(error.details));
      }
      const message = toErrorMessage(error);
      setFormError(message);
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  const renderBody = () => {
    if (status === 'loading') {
      return <AgentFormSkeleton />;
    }

    if (status === 'error' || meta === null || values === null) {
      return (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <TriangleAlertIcon className="size-8 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not load this agent</p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      );
    }

    const nameError = fieldErrors.name;
    const roleError = fieldErrors.role;
    const promptError = fieldErrors.prompt;
    const modelError = fieldErrors.model;
    const runsError = fieldErrors.runsPerDay;

    return (
      <form
        className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-name">Name</Label>
          <Input
            id="agent-name"
            value={values.name}
            autoComplete="off"
            maxLength={80}
            placeholder="Guide writer"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'agent-name-error' : undefined}
            onChange={(event) =>
              setValues((current) => (current ? { ...current, name: event.target.value } : current))
            }
          />
          {nameError ? (
            <p id="agent-name-error" className="text-sm text-destructive">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-role">Role</Label>
          <select
            id="agent-role"
            className={SELECT_CLASS}
            value={values.role}
            aria-invalid={Boolean(roleError)}
            aria-describedby={roleError ? 'agent-role-error agent-role-help' : 'agent-role-help'}
            onChange={(event) => handleRoleChange(event.target.value as AgentRole)}
          >
            {roleDefinitions.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
          <p id="agent-role-help" className="text-xs text-muted-foreground">
            {activeRole?.description ?? 'Choose how this agent works on the content pipeline.'}
          </p>
          {roleError ? (
            <p id="agent-role-error" className="text-sm text-destructive">
              {roleError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-prompt">Prompt</Label>
          <textarea
            id="agent-prompt"
            rows={PROMPT_ROWS}
            className={TEXTAREA_CLASS}
            value={values.prompt}
            spellCheck={false}
            aria-invalid={Boolean(promptError)}
            aria-describedby={promptError ? 'agent-prompt-error' : undefined}
            onChange={(event) => {
              promptTouchedRef.current = true;
              setValues((current) =>
                current ? { ...current, prompt: event.target.value } : current,
              );
            }}
          />
          {promptError ? (
            <p id="agent-prompt-error" className="text-sm text-destructive">
              {promptError}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-model">Model</Label>
            <select
              id="agent-model"
              className={SELECT_CLASS}
              value={values.model}
              aria-invalid={Boolean(modelError)}
              aria-describedby={modelError ? 'agent-model-error' : undefined}
              onChange={(event) =>
                setValues((current) =>
                  current ? { ...current, model: event.target.value } : current,
                )
              }
            >
              {meta.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            {modelError ? (
              <p id="agent-model-error" className="text-sm text-destructive">
                {modelError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-runs">Runs per day</Label>
            <Input
              id="agent-runs"
              type="number"
              inputMode="numeric"
              min={meta.minRunsPerDay}
              max={meta.maxRunsPerDay}
              value={values.runsPerDay}
              aria-invalid={Boolean(runsError)}
              aria-describedby={runsError ? 'agent-runs-error' : 'agent-runs-help'}
              onChange={(event) =>
                setValues((current) =>
                  current ? { ...current, runsPerDay: event.target.value } : current,
                )
              }
            />
            {runsError ? (
              <p id="agent-runs-error" className="text-sm text-destructive">
                {runsError}
              </p>
            ) : (
              <p id="agent-runs-help" className="text-xs tabular-nums text-muted-foreground">
                Between {meta.minRunsPerDay} and {meta.maxRunsPerDay} times per day.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input
              id="agent-enabled"
              type="checkbox"
              className="size-4 rounded border-input accent-primary"
              checked={values.enabled}
              onChange={(event) =>
                setValues((current) =>
                  current ? { ...current, enabled: event.target.checked } : current,
                )
              }
            />
            <Label htmlFor="agent-enabled">Enabled</Label>
          </div>

          {isReviewer ? (
            <div className="flex items-center gap-3">
              <input
                id="agent-auto-publish"
                type="checkbox"
                className="size-4 rounded border-input accent-primary"
                checked={values.autoPublish}
                onChange={(event) =>
                  setValues((current) =>
                    current ? { ...current, autoPublish: event.target.checked } : current,
                  )
                }
              />
              <Label htmlFor="agent-auto-publish">Auto publish approved drafts</Label>
            </div>
          ) : null}
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline" className="whitespace-nowrap">
            <a href="/dashboard/agents">Cancel</a>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="whitespace-nowrap">
            {isSubmitting ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {mode === 'edit'
              ? isSubmitting
                ? 'Saving'
                : 'Save changes'
              : isSubmitting
                ? 'Creating'
                : 'Create agent'}
          </Button>
        </div>
      </form>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            {mode === 'edit' ? 'Edit agent' : 'New agent'}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {mode === 'edit'
              ? 'Update the role, prompt, and schedule for this agent.'
              : 'Pick a role, tune the prompt, and set how often the agent should run.'}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="whitespace-nowrap">
          <a href="/dashboard/agents">
            <ArrowLeftIcon />
            Back to agents
          </a>
        </Button>
      </div>

      {renderBody()}

      {mode === 'edit' && status === 'ready' ? (
        <section
          aria-label="Run history"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
        >
          <h3 className="text-sm font-medium text-foreground">Run history</h3>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">This agent has not run yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <time className="text-sm tabular-nums text-foreground" dateTime={run.startedAt}>
                      {formatTimestamp(run.startedAt)}
                    </time>
                    <Badge variant={RUN_STATUS_VARIANT[run.status]}>
                      {RUN_STATUS_LABEL[run.status]}
                    </Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatTokens(run.tokensIn, run.tokensOut)}
                    </span>
                  </div>
                  {run.summary ? (
                    <p className="text-sm text-muted-foreground">{run.summary}</p>
                  ) : null}
                  {run.error ? <p className="text-sm text-destructive">{run.error}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
