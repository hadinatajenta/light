import { Badge } from '@/components/ui/badge';
import type { AnalystSourceView } from '@/lib/dashboard/analyst';
import {
  ANALYST_SOURCE_STATE_LABELS,
  describeAnalystSource,
} from '@/lib/dashboard/analyst-presentation';
import { formatRelativeTime } from '@/utils/date';

const SOURCE_BADGE_VARIANTS: Record<
  AnalystSourceView['status'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  ok: 'default',
  missing: 'secondary',
  error: 'destructive',
  unknown: 'outline',
};

interface AnalystSourceListProps {
  sources: AnalystSourceView[];
}

export default function AnalystSourceList({ sources }: AnalystSourceListProps) {
  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        No source has reported anything yet. Run the Performance Analyst once so each source records
        what it returned.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {sources.map((entry) => (
        <li key={entry.source} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {describeAnalystSource(entry.source)}
            </span>
            <Badge variant={SOURCE_BADGE_VARIANTS[entry.status]}>
              {ANALYST_SOURCE_STATE_LABELS[entry.status]}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {entry.checkedAt === null
                ? 'Never checked'
                : `Checked ${formatRelativeTime(entry.checkedAt)}`}
              {entry.rowCount > 0 ? ` · ${entry.rowCount} rows` : ''}
            </span>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">{entry.detail}</p>
          {entry.remediation ? (
            <p className="max-w-prose text-sm text-foreground">
              <span className="font-medium">Next action: </span>
              {entry.remediation}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
