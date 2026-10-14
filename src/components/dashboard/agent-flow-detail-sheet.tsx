import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  STAGE_DETAIL_ENDPOINT,
  STAGE_DETAIL_SHEET_ID,
  type StageDetail,
  type StageId,
  type StageWaitingItem,
} from '@/components/dashboard/agent-flow-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { requestJson, toErrorMessage } from './api-client';

const STAGE_REFRESH_MS = 15_000;
const STATUS_LABELS: Record<string, string> = {
  queued: 'queued',
  fetched: 'fetched',
  researched: 'researched',
  blocked: 'blocked',
  dead: 'dead',
  pending: 'pending',
  in_review: 'in review',
  changes_requested: 'changes requested',
  published: 'published',
  draft: 'draft',
};
const RUN_STATUS_LABELS: Record<string, string> = {
  succeeded: 'succeeded',
  failed: 'failed',
  skipped: 'skipped',
};

type DetailStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AgentFlowDetailSheetProps {
  stageId: StageId | null;
  onClose: () => void;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function CapabilityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-2">
      <dt className="text-xs tracking-[0.08em] text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function countOf(stage: StageDetail['stage'], key: 'waiting' | 'active' | 'doneToday' | 'bounced') {
  return stage[key];
}

function WaitingItemList({
  items,
  totalWaiting,
}: {
  items: StageWaitingItem[];
  totalWaiting: number;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is waiting here. Work arrives when an upstream stage hands it over.
      </p>
    );
  }

  const hidden = Math.max(0, totalWaiting - items.length);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {items.map((waitingItem) => (
          <li
            key={waitingItem.id}
            className="flex flex-col gap-0.5 rounded-lg border border-border p-2"
          >
            <span className="text-sm text-foreground">{waitingItem.title}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{statusLabel(waitingItem.status)}</Badge>
              <span className="tabular-nums">
                {waitingItem.updatedAt
                  ? `updated ${formatRelativeTime(waitingItem.updatedAt)}`
                  : 'no timestamp'}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">and {hidden} more waiting.</p>
      ) : null}
    </div>
  );
}

export default function AgentFlowDetailSheet({ stageId, onClose }: AgentFlowDetailSheetProps) {
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [status, setStatus] = useState<DetailStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const detailRef = useRef<StageDetail | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  const loadDetail = useCallback(async (targetStageId: StageId, mode: 'open' | 'refresh') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestSequence = sequenceRef.current + 1;
    sequenceRef.current = requestSequence;

    if (mode === 'open') {
      setDetail(null);
      detailRef.current = null;
      setStatus('loading');
      setLoadError(null);
    }

    try {
      const payload = await requestJson<StageDetail>(
        `${STAGE_DETAIL_ENDPOINT}?stage=${encodeURIComponent(targetStageId)}`,
        { signal: controller.signal },
      );

      if (controller.signal.aborted || requestSequence !== sequenceRef.current) {
        return;
      }

      detailRef.current = payload;
      setDetail(payload);
      setStatus('ready');
      setIsStale(false);
      setLoadError(null);
    } catch (error) {
      if (controller.signal.aborted || requestSequence !== sequenceRef.current) {
        return;
      }

      if (detailRef.current === null) {
        setLoadError(toErrorMessage(error));
        setStatus('error');
      } else {
        setIsStale(true);
      }
    }
  }, []);

  useEffect(() => {
    if (stageId === null) {
      abortRef.current?.abort();
      setDetail(null);
      detailRef.current = null;
      setStatus('idle');
      setLoadError(null);
      setIsStale(false);
      return;
    }

    void loadDetail(stageId, 'open');
  }, [stageId, loadDetail]);

  useEffect(() => {
    if (stageId === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void loadDetail(stageId, 'refresh');
      }
    }, STAGE_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [stageId, loadDetail]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const isOpen = stageId !== null;
  const now = Date.now();

  return (
    <Sheet open={isOpen} onOpenChange={(nextOpen) => (nextOpen ? undefined : onClose())}>
      <SheetContent id={STAGE_DETAIL_SHEET_ID} side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{detail?.stage.label ?? 'Stage detail'}</SheetTitle>
          <SheetDescription>
            {detail?.stage.description ?? 'Live detail for the selected pipeline stage.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {status === 'loading' ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <span className="sr-only">Loading the stage detail</span>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-3">
              <TriangleAlertIcon className="size-6 text-destructive" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">Could not load this stage</p>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">{loadError}</p>
              </div>
              {stageId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => void loadDetail(stageId, 'open')}
                >
                  <RefreshCwIcon aria-hidden="true" />
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}

          {detail ? (
            <>
              {isStale ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                  <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    Live updates paused. Showing the last detail received.
                  </span>
                  {stageId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="whitespace-nowrap"
                      onClick={() => void loadDetail(stageId, 'refresh')}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <dl className="grid grid-cols-2 gap-2">
                <CapabilityRow label="Waiting" value={countOf(detail.stage, 'waiting')} />
                <CapabilityRow label="Active" value={countOf(detail.stage, 'active')} />
                <CapabilityRow label="Done today" value={countOf(detail.stage, 'doneToday')} />
                <CapabilityRow label="Bounced" value={countOf(detail.stage, 'bounced')} />
              </dl>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">Agents</h3>
                {detail.stage.agents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No agent owns this stage. The publisher releases approved drafts on its own.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {detail.stage.agents.map((agent) => (
                      <li
                        key={agent.id}
                        className="flex flex-col gap-0.5 rounded-lg border border-border p-2"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-foreground">{agent.name}</span>
                          {agent.running ? <Badge variant="default">working now</Badge> : null}
                          {!agent.enabled ? <Badge variant="secondary">disabled</Badge> : null}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {agent.cadenceLabel}
                          {agent.nextRunAt
                            ? ` · next run ${formatRelativeTime(agent.nextRunAt, now)}`
                            : ' · no next run scheduled'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">Waiting here</h3>
                <WaitingItemList
                  items={detail.waitingItems}
                  totalWaiting={countOf(detail.stage, 'waiting')}
                />
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">Recent runs</h3>
                {detail.recentRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No runs recorded for this stage yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {detail.recentRuns.map((run) => (
                      <li
                        key={run.runId}
                        className="flex flex-col gap-0.5 rounded-lg border border-border p-2"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              run.status === 'failed'
                                ? 'destructive'
                                : run.status === 'skipped'
                                  ? 'secondary'
                                  : 'default'
                            }
                          >
                            {RUN_STATUS_LABELS[run.status]}
                          </Badge>
                          <span className="text-sm text-foreground">{run.agentName}</span>
                        </span>
                        {run.summary ? (
                          <span className="text-xs text-muted-foreground">{run.summary}</span>
                        ) : null}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          started {formatRelativeTime(run.startedAt, now)}
                          {run.tokensOut !== null ? ` · ${run.tokensOut} tokens out` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="flex flex-wrap gap-2">
                <a
                  href="/dashboard/agents/topics"
                  className="text-sm text-foreground underline underline-offset-4"
                >
                  Open topics
                </a>
                <a
                  href="/dashboard/activity"
                  className="text-sm text-foreground underline underline-offset-4"
                >
                  Open activity
                </a>
              </div>

              <p className={cn('text-xs text-muted-foreground tabular-nums')}>
                Updated {formatRelativeTime(detail.generatedAt, now)}
              </p>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
