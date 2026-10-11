import type { LiveRecentRun } from '@/lib/agents/live';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';

const ROLE_LABELS: Record<string, string> = {
  writer: 'Writer',
  reviewer: 'Reviewer',
  qc: 'QC',
  scrapper: 'Scrapper',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export default function AgentTimeline({ runs }: { runs: LiveRecentRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        No agent runs recorded yet. Finished runs will appear here with their outcome and summary.
      </p>
    );
  }

  return (
    <ol aria-label="Recent agent runs" className="flex flex-col">
      {runs.map((run) => (
        <li key={run.runId} className="flex gap-3 pb-5 last:pb-0">
          <span className="flex flex-col items-center" aria-hidden="true">
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                run.status === 'failed' ? 'bg-destructive' : 'bg-primary',
              )}
            />
            <span className="mt-1 w-px flex-1 bg-border" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="truncate text-sm font-medium text-foreground">{run.agentName}</span>
              <span className="text-xs text-muted-foreground">{roleLabel(run.role)}</span>
              <span
                className={cn(
                  'text-xs font-medium',
                  run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {run.status === 'failed' ? 'Failed' : 'Succeeded'}
              </span>
              <time
                className="ml-auto text-xs text-muted-foreground tabular-nums"
                dateTime={run.startedAt}
              >
                {formatRelativeTime(run.startedAt)}
              </time>
            </div>

            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              {run.summary ?? 'No summary recorded.'}
            </p>

            {run.tokensOut !== null ? (
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {run.tokensOut} tokens out
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
