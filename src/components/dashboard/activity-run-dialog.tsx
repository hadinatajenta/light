import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleSlashIcon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/utils/date';
import {
  type ActivityEntry,
  type ActivityRunDetail,
  type ActivityRunStatus,
  buildRetryToastMessage,
  formatAbsoluteTime,
  formatTokenCount,
  parseRetryResponse,
  parseRunDetailResponse,
  resolveRunStatusPresentation,
} from './activity-query';
import { requestJson, toErrorMessage } from './api-client';
import { DialogSurface } from './dialog-surface';

const RUNS_ENDPOINT = '/api/dashboard/agents/runs';
const SKELETON_LINES = ['run-skeleton-1', 'run-skeleton-2', 'run-skeleton-3'];

const ROLE_LABELS: Record<string, string> = {
  writer: 'Writer',
  reviewer: 'Reviewer',
  qc: 'QC',
  scrapper: 'Scrapper',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function RunStatusIcon({ status }: { status: ActivityRunStatus }) {
  if (status === 'succeeded') {
    return <CircleCheckIcon className="size-4 shrink-0" aria-hidden="true" />;
  }
  if (status === 'failed') {
    return <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />;
  }
  if (status === 'skipped') {
    return <CircleSlashIcon className="size-4 shrink-0" aria-hidden="true" />;
  }

  return (
    <Loader2Icon
      className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}

function RunTiming({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs tracking-[0.06em] text-muted-foreground uppercase">{row.label}</dt>
          <dd className="text-sm tabular-nums text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RelatedActivity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity entries reference this run.</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{entry.action}</span>
            <time
              className="ml-auto text-xs tabular-nums text-muted-foreground"
              dateTime={entry.createdAt}
              title={formatAbsoluteTime(entry.createdAt)}
            >
              {formatRelativeTime(entry.createdAt)}
            </time>
          </div>
          <p className="text-sm text-muted-foreground">{entry.summary}</p>
        </li>
      ))}
    </ul>
  );
}

function RunDetailSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading run detail</span>
      {SKELETON_LINES.map((lineKey) => (
        <Skeleton key={lineKey} className="h-4 w-full" />
      ))}
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

interface ActivityRunDialogProps {
  runId: string | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onRetried: () => void;
}

export default function ActivityRunDialog({
  runId,
  isOpen,
  onOpenChange,
  onRetried,
}: ActivityRunDialogProps) {
  const [detail, setDetail] = useState<ActivityRunDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const detailControllerRef = useRef<AbortController | null>(null);
  const retryControllerRef = useRef<AbortController | null>(null);

  const loadDetail = useCallback(async (targetRunId: string, isSilent = false) => {
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;

    if (isSilent) {
      setIsRefreshing(true);
    } else {
      setStatus('loading');
      setLoadError(null);
    }

    try {
      const payload = await requestJson<unknown>(
        `${RUNS_ENDPOINT}/${encodeURIComponent(targetRunId)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }

      const parsed = parseRunDetailResponse(payload);
      if (parsed === null) {
        setDetail(null);
        setLoadError('The server returned an unexpected run payload.');
        setStatus('error');
        return;
      }

      setDetail(parsed);
      setHasLoaded(true);
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
    if (!isOpen || runId === null) {
      return;
    }

    setHasLoaded(false);
    setDetail(null);
    setIsRetrying(false);
    setIsRefreshing(false);
    void loadDetail(runId);

    return () => detailControllerRef.current?.abort();
  }, [isOpen, runId, loadDetail]);

  useEffect(() => {
    return () => retryControllerRef.current?.abort();
  }, []);

  const handleRetry = async () => {
    if (runId === null || isRetrying) {
      return;
    }

    retryControllerRef.current?.abort();
    const controller = new AbortController();
    retryControllerRef.current = controller;
    setIsRetrying(true);

    try {
      const payload = await requestJson<unknown>(
        `${RUNS_ENDPOINT}/${encodeURIComponent(runId)}/retry`,
        { method: 'POST', signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }

      const outcome = parseRetryResponse(payload);
      if (outcome === null) {
        toast.error('The server returned an unexpected retry payload.');
        return;
      }

      const message = buildRetryToastMessage(outcome);
      if (outcome.status === 'succeeded') {
        toast.success(message);
      } else if (outcome.status === 'skipped') {
        toast(message);
      } else {
        toast.error(message);
      }

      onRetried();
      void loadDetail(runId, true);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      toast.error(toErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setIsRetrying(false);
      }
    }
  };

  const presentation = detail === null ? null : resolveRunStatusPresentation(detail.run.status);
  const isRunActive = detail !== null && detail.run.status === 'running';
  const showSkeleton = status === 'loading' && !hasLoaded;
  const showErrorState = status === 'error' && !hasLoaded;
  const showDetail = detail !== null;
  const showStaleError = loadError !== null && hasLoaded;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
      <DialogSurface className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <div className="flex flex-col gap-1 pr-8">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">
            Agent run
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            The run record an agent wrote, with the activity entries it produced.
          </DialogPrimitive.Description>
        </div>

        {isRefreshing && hasLoaded ? (
          <p
            role="status"
            aria-live="polite"
            className="text-xs tabular-nums text-muted-foreground"
          >
            Updating
          </p>
        ) : null}

        {showStaleError ? (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{loadError}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="whitespace-nowrap"
              disabled={isRefreshing}
              onClick={() => {
                if (runId !== null) {
                  void loadDetail(runId, true);
                }
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {showSkeleton ? <RunDetailSkeleton /> : null}

        {showErrorState ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4">
            <CircleAlertIcon className="size-6 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">Could not load the run</p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => {
                if (runId !== null) {
                  void loadDetail(runId);
                }
              }}
            >
              <RefreshCwIcon />
              Retry
            </Button>
          </div>
        ) : null}

        {showDetail && presentation !== null ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={presentation.badge} className="gap-1.5">
                <RunStatusIcon status={detail.run.status} />
                {presentation.label}
              </Badge>
              {detail.agent ? (
                <>
                  <span className="truncate text-sm font-medium text-foreground">
                    {detail.agent.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {roleLabel(detail.agent.role)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Agent no longer exists</span>
              )}
              <time
                className="ml-auto text-xs tabular-nums text-muted-foreground"
                dateTime={detail.run.startedAt}
                title={formatAbsoluteTime(detail.run.startedAt)}
              >
                {formatRelativeTime(detail.run.startedAt)}
              </time>
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="text-xs tracking-[0.06em] text-muted-foreground uppercase">Summary</h3>
              <p className="text-sm text-foreground">
                {detail.run.summary ?? 'No summary recorded.'}
              </p>
            </div>

            <RunTiming
              rows={[
                { label: 'Tokens in', value: formatTokenCount(detail.run.tokensIn) },
                { label: 'Tokens out', value: formatTokenCount(detail.run.tokensOut) },
                { label: 'Started', value: formatAbsoluteTime(detail.run.startedAt) },
                { label: 'Finished', value: formatAbsoluteTime(detail.run.finishedAt) },
              ]}
            />

            {detail.run.error !== null ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2"
              >
                <p className="text-xs tracking-[0.06em] text-destructive uppercase">Error</p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-destructive">
                  {detail.run.error}
                </p>
              </div>
            ) : null}

            {detail.run.output !== null ? (
              <section aria-label="Run output" className="flex flex-col gap-2">
                <h3 className="text-xs tracking-[0.06em] text-muted-foreground uppercase">
                  Output
                </h3>
                <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
                  {detail.run.output}
                </pre>
              </section>
            ) : null}

            <section aria-label="Activity for this run" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs tracking-[0.06em] text-muted-foreground uppercase">
                  Activity
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {detail.activity.length}
                </span>
              </div>
              <RelatedActivity entries={detail.activity} />
            </section>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isRunActive ? (
                <p className="text-sm text-muted-foreground">
                  This run is still in progress, so it cannot be retried yet.
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="whitespace-nowrap"
                  disabled={isRetrying}
                  onClick={() => void handleRetry()}
                >
                  {isRetrying ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                  {isRetrying ? 'Retrying' : 'Retry run'}
                </Button>
              )}
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" className="whitespace-nowrap">
                  Close
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only">
          {isRetrying ? 'Retrying the agent run' : ''}
        </p>
      </DialogSurface>
    </DialogPrimitive.Root>
  );
}
