import { CheckIcon, Loader2Icon, SaveIcon } from 'lucide-react';
import { type SubmitEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AnalystConfig } from '@/lib/agents/analyst/config';
import type { AgentScheduleMode } from '@/lib/agents/roles';
import type { AgentRecord } from '@/lib/agents/store';
import type { AnalystDashboardState } from '@/lib/dashboard/analyst';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import AnalystSourceList from './analyst-source-list';
import { requestJson, toErrorMessage, toFieldErrorMap } from './api-client';

const AGENTS_ENDPOINT = '/api/dashboard/agents';
const SETTINGS_ENDPOINT = '/api/dashboard/analyst/settings';
const CONTROL_CLASS = 'h-11 sm:h-9';

const SCHEDULE_MODES: AgentScheduleMode[] = ['manual', 'daily', 'weekly'];

const SCHEDULE_MODE_LABELS: Record<AgentScheduleMode, string> = {
  manual: 'Manual',
  interval: 'Runs per day',
  daily: 'Daily',
  weekly: 'Weekly',
  hours: 'Fixed hours',
};

const SCHEDULE_MODE_HELP: Record<AgentScheduleMode, string> = {
  manual: 'Manual: the scheduler skips it. Run it from the Agents page when you want it.',
  interval:
    'Runs per day: the scheduler uses this agent runs per day setting. This is the normal mode for the content agents.',
  daily: 'Daily: the scheduler picks it up when its next run time passes.',
  weekly: 'Weekly: the scheduler picks it up when its next run time passes.',
  hours: 'Fixed hours: the scheduler uses the Asia/Jakarta hours stored on the agent.',
};

interface ThresholdField {
  key: keyof AnalystConfig;
  label: string;
  help: string;
  step: string;
  min: number;
  max: number;
}

const THRESHOLD_FIELDS: ThresholdField[] = [
  {
    key: 'noLinkMinViewsShare',
    label: 'Minimum share of window views',
    help: 'Share of the total views in the window that an article needs before the missing-link rule fires. A value of 0.02 means 2 percent. The floor below always applies too.',
    step: '0.005',
    min: 0,
    max: 1,
  },
  {
    key: 'noLinkMinViewsFloor',
    label: 'Minimum views floor',
    help: 'The lowest view count the missing-link rule can fire on, whatever the share allows.',
    step: '1',
    min: 0,
    max: 1000,
  },
  {
    key: 'brokenPlacementMinClicks',
    label: 'Clicks before a placement is broken',
    help: 'A product needs at least this many clicks in the window before the rule reports that those clicks cannot earn.',
    step: '1',
    min: 0,
    max: 10000,
  },
  {
    key: 'redirectMissMinCount',
    label: 'Misses before a go link is reported',
    help: 'How often /go/ has to return nothing for the same slug before it becomes a finding.',
    step: '1',
    min: 1,
    max: 10000,
  },
  {
    key: 'zeroViewsMinAgeDays',
    label: 'Days before a post counts as unread',
    help: 'A published post older than this many days with zero views in the window is reported.',
    step: '1',
    min: 1,
    max: 3650,
  },
  {
    key: 'zeroViewsMaxFindings',
    label: 'Unread posts reported per run',
    help: 'The cap on how many zero-view findings one run may add, so the queue stays actionable.',
    step: '1',
    min: 0,
    max: 100,
  },
];

function toThresholdValues(config: AnalystConfig): Record<string, string> {
  return Object.fromEntries(
    THRESHOLD_FIELDS.map((field) => [field.key, String(config[field.key])]),
  );
}

function buildAgentSchedulePayload(agent: AgentRecord, scheduleMode: AgentScheduleMode) {
  return {
    name: agent.name,
    role: agent.role,
    prompt: agent.prompt,
    model: agent.model,
    runsPerDay: agent.runsPerDay,
    enabled: agent.enabled,
    autoPublish: agent.autoPublish,
    categories: agent.categories,
    scheduleMode,
  };
}

interface AnalystScheduleCardProps {
  initial: AnalystDashboardState;
}

export default function AnalystScheduleCard({ initial }: AnalystScheduleCardProps) {
  const [agent, setAgent] = useState<AgentRecord | null>(initial.agent);
  const [config, setConfig] = useState<AnalystConfig>(initial.config);
  const sources = initial.sources;
  const [scheduleMode, setScheduleMode] = useState<AgentScheduleMode>(
    initial.agent?.scheduleMode ?? 'manual',
  );
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, string>>(
    toThresholdValues(initial.config),
  );
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);
  const [thresholdErrors, setThresholdErrors] = useState<Record<string, string>>({});
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const saveSchedule = async (nextMode: AgentScheduleMode) => {
    if (!agent || isSavingSchedule) {
      return;
    }

    setIsSavingSchedule(true);
    setScheduleError(null);

    try {
      const payload = await requestJson<{ agent: AgentRecord }>(
        `${AGENTS_ENDPOINT}/${encodeURIComponent(agent.id)}`,
        { method: 'PUT', body: JSON.stringify(buildAgentSchedulePayload(agent, nextMode)) },
      );
      setAgent(payload.agent);
      const storedMode = payload.agent.scheduleMode ?? 'manual';
      setScheduleMode(storedMode);
      toast.success(`Schedule set to ${SCHEDULE_MODE_LABELS[storedMode]}.`);
    } catch (error) {
      const message = toErrorMessage(error);
      setScheduleError(message);
      toast.error(message);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const saveThresholds = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSavingThresholds) {
      return;
    }

    const parsed: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const field of THRESHOLD_FIELDS) {
      const raw = thresholds[field.key] ?? '';
      const value = Number.parseFloat(raw);

      if (raw.trim() === '' || !Number.isFinite(value)) {
        errors[field.key] = 'Enter a number.';
        continue;
      }

      parsed[field.key] = value;
    }

    if (Object.keys(errors).length > 0) {
      setThresholdErrors(errors);
      setSettingsError(null);
      return;
    }

    setIsSavingThresholds(true);
    setThresholdErrors({});
    setSettingsError(null);

    try {
      const payload = await requestJson<{ config: AnalystConfig }>(SETTINGS_ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      });
      setConfig(payload.config);
      setThresholds(toThresholdValues(payload.config));
      toast.success('Thresholds saved.');
    } catch (error) {
      const fieldErrors = toFieldErrorMap(error);
      setThresholdErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) {
        setSettingsError(toErrorMessage(error));
      }
      toast.error(toErrorMessage(error));
    } finally {
      setIsSavingThresholds(false);
    }
  };

  const savedScheduleMode = agent?.scheduleMode ?? 'manual';
  const hasScheduleChange = scheduleMode !== savedScheduleMode;
  const nextRun = agent?.nextRunAt ?? null;

  return (
    <section aria-label="Analyst schedule, thresholds, and sources" className="flex flex-col gap-4">
      {agent === null ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">The analyst does not exist yet</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            The scheduled agent run creates the Performance Analyst. Until then there is no schedule
            to change and no threshold to store.
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSchedule(scheduleMode);
          }}
          aria-busy={isSavingSchedule}
        >
          <div>
            <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
              Schedule
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              The analyst makes no model calls and costs nothing per run. Manual keeps it off the
              scheduler entirely.
            </p>
          </div>

          <fieldset className="flex flex-wrap items-center gap-1 rounded-md border border-border p-1">
            <legend className="sr-only">Schedule mode</legend>
            {SCHEDULE_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={mode === scheduleMode}
                disabled={isSavingSchedule}
                onClick={() => setScheduleMode(mode)}
                className={cn(
                  'min-h-11 rounded px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-8',
                  mode === scheduleMode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {SCHEDULE_MODE_LABELS[mode]}
              </button>
            ))}
          </fieldset>

          <p className="max-w-prose text-xs text-muted-foreground">
            {SCHEDULE_MODE_HELP[scheduleMode]}
          </p>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col">
              <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
                Last run
              </dt>
              <dd className="text-sm tabular-nums">
                {agent.lastRunAt ? formatRelativeTime(agent.lastRunAt) : 'Has not run yet'}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col">
              <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">
                Next run
              </dt>
              <dd className="text-sm tabular-nums">
                {nextRun ? formatRelativeTime(nextRun) : 'Not scheduled'}
              </dd>
            </div>
          </dl>

          {scheduleError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {scheduleError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              className="h-11 whitespace-nowrap sm:h-8"
              disabled={isSavingSchedule || !hasScheduleChange}
            >
              {isSavingSchedule ? (
                <Loader2Icon className="animate-spin" aria-hidden="true" />
              ) : (
                <SaveIcon aria-hidden="true" />
              )}
              {isSavingSchedule ? 'Saving' : 'Save schedule'}
            </Button>
            {hasScheduleChange ? (
              <span className="text-xs text-muted-foreground">
                The stored schedule is still {SCHEDULE_MODE_LABELS[savedScheduleMode]}.
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckIcon className="size-3.5" aria-hidden="true" />
                {SCHEDULE_MODE_LABELS[savedScheduleMode]} is stored.
              </span>
            )}
          </div>
        </form>
      )}

      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
        onSubmit={saveThresholds}
        noValidate
        aria-busy={isSavingThresholds}
      >
        <div>
          <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-foreground">
            Thresholds
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            These bounds decide which findings the analyst writes. A rule with a threshold it does
            not cross stays silent, so a looser bound means a longer queue.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {THRESHOLD_FIELDS.map((field) => {
            const inputId = `analyst-threshold-${field.key}`;
            const helpId = `${inputId}-help`;
            const error = thresholdErrors[field.key];

            return (
              <div key={field.key} className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={inputId}>{field.label}</Label>
                <Input
                  id={inputId}
                  type="number"
                  inputMode="decimal"
                  className={CONTROL_CLASS}
                  step={field.step}
                  min={field.min}
                  max={field.max}
                  value={thresholds[field.key] ?? ''}
                  aria-invalid={error !== undefined}
                  aria-describedby={error ? `${helpId} ${inputId}-error` : helpId}
                  onChange={(event) =>
                    setThresholds((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                />
                <p id={helpId} className="text-xs text-muted-foreground">
                  {field.help}
                </p>
                {error ? (
                  <p id={`${inputId}-error`} className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {settingsError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {settingsError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="sm"
            className="h-11 whitespace-nowrap sm:h-8"
            disabled={isSavingThresholds}
          >
            {isSavingThresholds ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <SaveIcon aria-hidden="true" />
            )}
            {isSavingThresholds ? 'Saving' : 'Save thresholds'}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Missing-link rule: floor {config.noLinkMinViewsFloor} views or{' '}
            {Math.round(config.noLinkMinViewsShare * 100)} percent of the window, whichever is
            higher.
          </span>
        </div>
      </form>

      <section
        id="analyst-sources"
        aria-labelledby="analyst-sources-heading"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <div>
          <h2
            id="analyst-sources-heading"
            className="font-display text-lg font-bold tracking-[-0.02em] text-foreground"
          >
            Data sources
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            What the analyst could read on its last run. A source that is not connected is never
            treated as zero, so the rules that need it stay dormant instead of writing a wrong
            finding.
          </p>
        </div>

        <AnalystSourceList sources={sources} />
      </section>
    </section>
  );
}
