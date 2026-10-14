import type { FindingPersistResult } from '../agents/analyst/findings';
import type { AnalystSourceStatus } from '../agents/analyst/sources';
import type { AnalystWindow } from '../agents/analyst/window';
import { ANALYST_SOURCE_LABELS } from '../dashboard/analyst-presentation';
import type { NotificationInput } from './types';

export const ANALYST_DASHBOARD_PATH = '/dashboard/analyst';

export function selectUnavailableAnalystSources(
  statuses: readonly AnalystSourceStatus[],
): AnalystSourceStatus[] {
  return statuses.filter((status) => status.status !== 'ok');
}

export function buildAnalystFindingsReadyNotification(input: {
  runId: string;
  window: AnalystWindow;
  persisted: Pick<FindingPersistResult, 'inserted' | 'refreshed'>;
}): NotificationInput | null {
  const changed = input.persisted.inserted + input.persisted.refreshed;

  if (changed <= 0) {
    return null;
  }

  return {
    event: 'analyst.findings.ready',
    title:
      changed === 1
        ? '1 performance finding is ready'
        : `${changed} performance findings are ready`,
    body: `${input.persisted.inserted} new, ${input.persisted.refreshed} updated for ${input.window.start} to ${input.window.end}. Open the queue to act on them.`,
    link: ANALYST_DASHBOARD_PATH,
    metadata: {
      inserted: input.persisted.inserted,
      refreshed: input.persisted.refreshed,
      windowStart: input.window.start,
      windowEnd: input.window.end,
    },
    runId: input.runId,
    dedupeSubject: input.runId,
  };
}

export function buildAnalystSourcesDegradedNotification(input: {
  statuses: readonly AnalystSourceStatus[];
}): NotificationInput | null {
  const unavailable = selectUnavailableAnalystSources(input.statuses);

  if (unavailable.length === 0) {
    return null;
  }

  const actions = unavailable.map(
    (status) => `${ANALYST_SOURCE_LABELS[status.source]}: ${status.remediation}`,
  );
  const subject = unavailable
    .map((status) => status.source)
    .sort((first, second) => first.localeCompare(second))
    .join(',');

  return {
    event: 'analyst.sources.degraded',
    title: `${unavailable.length} of ${input.statuses.length} performance sources cannot be read`,
    body: `The analyst ran without these sources. One action per source:\n${actions.join('\n')}`,
    link: ANALYST_DASHBOARD_PATH,
    metadata: {
      sources: unavailable.map((status) => status.source),
    },
    dedupeSubject: subject,
  };
}
