import { describe, expect, it } from 'vitest';
import type { AnalystSourceStatus } from '../agents/analyst/sources';
import { resolveAnalystWindow } from '../agents/analyst/window';
import {
  buildAnalystFindingsReadyNotification,
  buildAnalystSourcesDegradedNotification,
  selectUnavailableAnalystSources,
} from './analyst';
import { NOTIFICATION_RULES } from './rules';

const WINDOW = resolveAnalystWindow(new Date('2026-10-13T04:00:00.000Z'));

function sourceStatus(
  source: AnalystSourceStatus['source'],
  status: AnalystSourceStatus['status'],
  remediation: string,
): AnalystSourceStatus {
  return { source, status, detail: `${source} detail`, remediation, rowCount: 0 };
}

describe('buildAnalystFindingsReadyNotification', () => {
  it('stays silent when a run stores no new and no updated finding', () => {
    const notification = buildAnalystFindingsReadyNotification({
      runId: 'run-1',
      window: WINDOW,
      persisted: { inserted: 0, refreshed: 0 },
    });

    expect(notification).toBeNull();
  });

  it('announces the new and updated findings of a run', () => {
    const notification = buildAnalystFindingsReadyNotification({
      runId: 'run-7',
      window: WINDOW,
      persisted: { inserted: 3, refreshed: 2 },
    });

    expect(notification?.event).toBe('analyst.findings.ready');
    expect(notification?.title).toBe('5 performance findings are ready');
    expect(notification?.body).toContain('3 new, 2 updated');
    expect(notification?.body).toContain(`${WINDOW.start} to ${WINDOW.end}`);
    expect(notification?.link).toBe('/dashboard/analyst');
    expect(notification?.dedupeSubject).toBe('run-7');
    expect(NOTIFICATION_RULES['analyst.findings.ready']).toEqual({
      level: 'success',
      category: 'agent',
      push: true,
      dedupeWindowSeconds: 21600,
    });
  });

  it('uses a singular title for one finding', () => {
    const notification = buildAnalystFindingsReadyNotification({
      runId: 'run-8',
      window: WINDOW,
      persisted: { inserted: 1, refreshed: 0 },
    });

    expect(notification?.title).toBe('1 performance finding is ready');
  });
});

describe('buildAnalystSourcesDegradedNotification', () => {
  it('stays silent when every source was readable', () => {
    const notification = buildAnalystSourcesDegradedNotification({
      statuses: [sourceStatus('clicks', 'ok', ''), sourceStatus('post_views', 'ok', '')],
    });

    expect(notification).toBeNull();
  });

  it('names the concrete next action for every source that could not be read', () => {
    const notification = buildAnalystSourcesDegradedNotification({
      statuses: [
        sourceStatus('clicks', 'ok', ''),
        sourceStatus('post_views', 'ok', ''),
        sourceStatus('gsc', 'missing', 'Add the Search Console credential.'),
        sourceStatus('ga4', 'missing', 'Grant the service account Viewer.'),
        sourceStatus('affiliate_report', 'error', 'Apply migration 0027.'),
      ],
    });

    expect(notification?.event).toBe('analyst.sources.degraded');
    expect(notification?.title).toBe('3 of 5 performance sources cannot be read');
    expect(notification?.body).toContain('Search Console: Add the Search Console credential.');
    expect(notification?.body).toContain('GA4: Grant the service account Viewer.');
    expect(notification?.body).toContain('Affiliate network report: Apply migration 0027.');
    expect(NOTIFICATION_RULES['analyst.sources.degraded']).toEqual({
      level: 'warning',
      category: 'system',
      push: true,
      dedupeWindowSeconds: 604800,
    });
  });

  it('keys the dedupe subject on the set of unusable sources so a weekly run stays quiet', () => {
    const first = buildAnalystSourcesDegradedNotification({
      statuses: [
        sourceStatus('gsc', 'missing', 'Add the Search Console credential.'),
        sourceStatus('ga4', 'missing', 'Grant the service account Viewer.'),
      ],
    });
    const second = buildAnalystSourcesDegradedNotification({
      statuses: [
        sourceStatus('ga4', 'missing', 'Grant the service account Viewer.'),
        sourceStatus('gsc', 'missing', 'Add the Search Console credential.'),
      ],
    });

    expect(first?.dedupeSubject).toBe('ga4,gsc');
    expect(second?.dedupeSubject).toBe(first?.dedupeSubject);
  });
});

describe('selectUnavailableAnalystSources', () => {
  it('keeps every state that is not ok', () => {
    const unavailable = selectUnavailableAnalystSources([
      sourceStatus('clicks', 'ok', ''),
      sourceStatus('gsc', 'missing', 'a'),
      sourceStatus('ga4', 'error', 'b'),
    ]);

    expect(unavailable.map((status) => status.source)).toEqual(['gsc', 'ga4']);
  });
});
