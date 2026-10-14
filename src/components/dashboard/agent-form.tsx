import {
  ArrowLeftIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError, requestJson, toErrorMessage, toFieldErrorMap } from './api-client';

const AGENTS_ENDPOINT = '/api/dashboard/agents';
const CATEGORIES_ENDPOINT = '/api/dashboard/categories';
const PROMPT_ROWS = 10;

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

type AgentRole = 'planner' | 'writer' | 'reviewer' | 'qc' | 'scrapper' | 'analyst';
type AgentFormMode = 'create' | 'edit';
type RunStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

interface AgentRecord {
  id: string;
  name: string;
  role: AgentRole;
  prompt: string;
  provider: string;
  model: string;
  runsPerDay: number;
  enabled: boolean;
  autoPublish: boolean;
  categories: string[];
  scheduleMode: string;
  systemManaged: boolean;
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

interface ModelProviderOption {
  id: string;
  label: string;
  billing: string;
  models: string[];
}

interface AgentsMeta {
  roles: RoleDefinition[];
  providers: ModelProviderOption[];
  maxAgents: number;
  minRunsPerDay: number;
  maxRunsPerDay: number;
  defaultProvider: string;
  defaultModel: string;
}

interface AgentInput {
  name: string;
  role: AgentRole;
  prompt: string;
  provider: string;
  model: string;
  runsPerDay: number;
  enabled: boolean;
  autoPublish: boolean;
  categories: string[];
}

interface AgentFormValues {
  name: string;
  role: AgentRole;
  prompt: string;
  provider: string;
  model: string;
  runsPerDay: string;
  enabled: boolean;
  autoPublish: boolean;
  categories: string[];
}

interface CategoryOption {
  slug: string;
  label?: string | null;
}

interface AgentFormProps {
  mode: AgentFormMode;
  agentId?: string;
}

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  skipped: 'Skipped',
};

const RUN_STATUS_VARIANT: Record<RunStatus, 'default' | 'secondary' | 'destructive'> = {
  running: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
  skipped: 'secondary',
};

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
    provider: meta.defaultProvider,
    model: meta.defaultModel,
    runsPerDay: String(meta.minRunsPerDay),
    enabled: true,
    autoPublish: false,
    categories: [],
  };
}

function toFormValues(agent: AgentRecord): AgentFormValues {
  return {
    name: agent.name,
    role: agent.role,
    prompt: agent.prompt,
    provider: agent.provider,
    model: agent.model,
    runsPerDay: String(agent.runsPerDay),
    enabled: agent.enabled,
    autoPublish: agent.autoPublish,
    categories: agent.categories,
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
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [values, setValues] = useState<AgentFormValues | null>(null);
  const [isSystemManaged, setIsSystemManaged] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
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

      try {
        const categoriesPayload = await requestJson<{ categories: CategoryOption[] }>(
          CATEGORIES_ENDPOINT,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setCategories(
            categoriesPayload.categories.filter(
              (category) => typeof category.slug === 'string' && category.slug.length > 0,
            ),
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setCategories([]);
        }
      }

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
        setIsSystemManaged(detail.agent.systemManaged);
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

  const providerDefinitions = useMemo(() => meta?.providers ?? [], [meta]);
  const activeProviderDefinition = useMemo(
    () => providerDefinitions.find((provider) => provider.id === values?.provider),
    [providerDefinitions, values?.provider],
  );
  const activeModelOptions = activeProviderDefinition?.models ?? [];

  const categoryOptions = useMemo(() => {
    const options: Array<{ slug: string; label: string }> = categories.map((category) => ({
      slug: category.slug,
      label: category.label?.trim() ? category.label : category.slug,
    }));
    const knownSlugs = new Set(options.map((option) => option.slug));
    for (const slug of values?.categories ?? []) {
      if (!knownSlugs.has(slug)) {
        options.push({ slug, label: slug });
      }
    }
    return options;
  }, [categories, values?.categories]);

  const selectedCategoryCount = categoryOptions.filter((option) =>
    (values?.categories ?? []).includes(option.slug),
  ).length;

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

  const handleProviderChange = (nextProvider: string) => {
    setValues((current) => {
      if (!current) {
        return current;
      }
      const nextProviderDefinition = providerDefinitions.find(
        (provider) => provider.id === nextProvider,
      );
      return {
        ...current,
        provider: nextProvider,
        model: nextProviderDefinition?.models[0] ?? '',
      };
    });
  };

  const handleCategoryToggle = (slug: string, isChecked: boolean) => {
    setValues((current) => {
      if (!current) {
        return current;
      }
      const nextCategories = isChecked
        ? Array.from(new Set([...current.categories, slug]))
        : current.categories.filter((entry) => entry !== slug);
      return { ...current, categories: nextCategories };
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
      provider: values.provider,
      model: values.model,
      runsPerDay: Number.isNaN(runsPerDay) ? 0 : runsPerDay,
      enabled: isSystemManaged ? true : values.enabled,
      autoPublish: values.role === 'reviewer' ? values.autoPublish : false,
      categories: values.role === 'writer' ? values.categories : [],
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
        setFieldErrors(toFieldErrorMap(error));
      }
      const message = toErrorMessage(error);
      setFormError(message);
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  const handleDeleteAgent = async (): Promise<void> => {
    if (!agentId || isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      await requestJson<{ id: string; deleted: boolean }>(
        `${AGENTS_ENDPOINT}/${encodeURIComponent(agentId)}`,
        { method: 'DELETE' },
      );
      toast.success('Agent deleted.');
      window.location.assign('/dashboard/agents');
    } catch (error) {
      toast.error(toErrorMessage(error));
      setIsDeleting(false);
      setIsConfirmingDelete(false);
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
    const categoryError = fieldErrors.categories;
    const promptError = fieldErrors.prompt;
    const providerError = fieldErrors.provider;
    const modelError = fieldErrors.model;
    const runsError = fieldErrors.runsPerDay;

    return (
      <form
        className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        {isSystemManaged ? (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">
              {activeRole?.label ?? values.role} is built in
            </p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              It cannot be deleted, cannot change role or model, and cannot be switched off. It can
              only be scheduled. Its schedule, thresholds, and data sources live on the Performance
              page.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 whitespace-nowrap">
              <a href="/dashboard/analyst">Open Performance</a>
            </Button>
          </div>
        ) : null}

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

        {isSystemManaged ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Role</p>
            <p className="text-sm text-muted-foreground">
              {activeRole?.label ?? values.role}. {activeRole?.description ?? ''}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-role">Role</Label>
            <Select
              id="agent-role"
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
            </Select>
            <p id="agent-role-help" className="text-xs text-muted-foreground">
              {activeRole?.description ?? 'Choose how this agent works on the content pipeline.'}
            </p>
            {roleError ? (
              <p id="agent-role-error" className="text-sm text-destructive">
                {roleError}
              </p>
            ) : null}
          </div>
        )}

        {values.role === 'writer' ? (
          <fieldset
            className="flex flex-col gap-2"
            aria-invalid={Boolean(categoryError)}
            aria-describedby={
              categoryError
                ? 'agent-categories-error agent-categories-help'
                : 'agent-categories-help'
            }
          >
            <legend className="text-sm font-medium text-foreground">Categories</legend>
            {categoryOptions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No categories available yet. With none selected, the writer may claim a topic from
                any category.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-md border border-input bg-transparent p-1 shadow-xs dark:bg-input/30">
                <div className="flex flex-col">
                  {categoryOptions.map((option) => (
                    <label
                      key={option.slug}
                      className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input accent-primary"
                        checked={values.categories.includes(option.slug)}
                        onChange={(event) =>
                          handleCategoryToggle(option.slug, event.target.checked)
                        }
                      />
                      <span className="min-w-0 truncate">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs tabular-nums text-muted-foreground">
              {selectedCategoryCount === 0
                ? 'No categories selected'
                : `${selectedCategoryCount} of ${categoryOptions.length} selected`}
            </p>
            <p id="agent-categories-help" className="text-xs text-muted-foreground">
              The writer claims only topics from the selected categories. With none selected, it may
              claim a topic from any category.
            </p>
            {categoryError ? (
              <p id="agent-categories-error" className="text-sm text-destructive">
                {categoryError}
              </p>
            ) : null}
          </fieldset>
        ) : null}

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
          {isSystemManaged ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="agent-provider">Model provider</Label>
              <Select
                id="agent-provider"
                value={values.provider}
                aria-invalid={Boolean(providerError)}
                aria-describedby={
                  providerError ? 'agent-provider-error agent-provider-help' : 'agent-provider-help'
                }
                onChange={(event) => handleProviderChange(event.target.value)}
              >
                {providerDefinitions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </Select>
              <p id="agent-provider-help" className="text-xs text-muted-foreground">
                {activeProviderDefinition?.billing ??
                  'Choose the service that hosts the model for this agent.'}
              </p>
              {providerError ? (
                <p id="agent-provider-error" className="text-sm text-destructive">
                  {providerError}
                </p>
              ) : null}
            </div>
          )}

          {isSystemManaged ? null : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="agent-model">Model</Label>
              <Select
                id="agent-model"
                value={values.model}
                aria-invalid={Boolean(modelError)}
                aria-describedby={
                  modelError ? 'agent-model-error agent-model-help' : 'agent-model-help'
                }
                onChange={(event) =>
                  setValues((current) =>
                    current ? { ...current, model: event.target.value } : current,
                  )
                }
              >
                {activeModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </Select>
              <p id="agent-model-help" className="text-xs text-muted-foreground">
                {activeModelOptions.length === 0
                  ? 'This provider has no models available.'
                  : `Served by ${activeProviderDefinition?.label ?? values.provider}.`}
              </p>
              {modelError ? (
                <p id="agent-model-error" className="text-sm text-destructive">
                  {modelError}
                </p>
              ) : null}
            </div>
          )}

          {isSystemManaged ? null : (
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
          )}
        </div>

        <div className="flex flex-col gap-3">
          {isSystemManaged ? null : (
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
          )}

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
              ? isSystemManaged
                ? 'Update the name and prompt of a built-in agent. Everything else about it is fixed by the engine.'
                : 'Update the role, prompt, and schedule for this agent.'
              : 'Pick a role, tune the prompt, and set how often the agent should run.'}
          </p>
        </div>
        {mode === 'edit' && !isSystemManaged ? (
          isConfirmingDelete ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
            >
              <span className="text-sm text-destructive">
                Delete this agent and its run history?
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                disabled={isDeleting}
                onClick={() => setIsConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="whitespace-nowrap"
                disabled={isDeleting}
                onClick={() => void handleDeleteAgent()}
              >
                {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
                {isDeleting ? 'Deleting' : 'Delete agent'}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="whitespace-nowrap text-destructive hover:text-destructive"
              onClick={() => setIsConfirmingDelete(true)}
            >
              <Trash2Icon />
              Delete agent
            </Button>
          )
        ) : null}
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
