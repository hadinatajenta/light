import { describe, expect, it } from 'vitest';
import { ANALYST_FINDING_STATUSES } from '../agents/analyst/findings';
import type { AnalystSource } from '../agents/analyst/sources';
import {
  type AnalystSourceStatusRecord,
  canApplyAnalystFindingStatus,
  mergeAnalystSourceStatuses,
} from './analyst';

describe('canApplyAnalystFindingStatus', () => {
  it('lets an open finding be resolved or dismissed', () => {
    expect(canApplyAnalystFindingStatus('open', 'resolved')).toBe(true);
    expect(canApplyAnalystFindingStatus('open', 'dismissed')).toBe(true);
  });

  it('refuses to resolve a finding twice', () => {
    expect(canApplyAnalystFindingStatus('resolved', 'resolved')).toBe(false);
  });

  it('reopens a resolved, dismissed, or actioned finding but never an open one', () => {
    expect(canApplyAnalystFindingStatus('resolved', 'open')).toBe(true);
    expect(canApplyAnalystFindingStatus('dismissed', 'open')).toBe(true);
    expect(canApplyAnalystFindingStatus('actioned', 'open')).toBe(true);
    expect(canApplyAnalystFindingStatus('open', 'open')).toBe(false);
  });

  it('never reopens an expired finding because the analyst reopens it on its own', () => {
    expect(canApplyAnalystFindingStatus('expired', 'open')).toBe(false);
    expect(canApplyAnalystFindingStatus('expired', 'resolved')).toBe(false);
    expect(canApplyAnalystFindingStatus('expired', 'dismissed')).toBe(true);
  });

  it('declares at least one reachable target for every status', () => {
    for (const status of ANALYST_FINDING_STATUSES) {
      const reachable = ANALYST_FINDING_STATUSES.filter((target) =>
        canApplyAnalystFindingStatus(status, target),
      );

      expect(reachable.length).toBeGreaterThan(0);
    }
  });
});

function sourceRecord(
  source: AnalystSource,
  overrides: Partial<AnalystSourceStatusRecord> = {},
): AnalystSourceStatusRecord {
  return {
    source,
    status: 'ok',
    detail: 'Read 4 rows.',
    remediation: '',
    rowCount: 4,
    checkedAt: '2026-10-01T02:00:00.000Z',
    ...overrides,
  };
}

describe('mergeAnalystSourceStatuses', () => {
  it('keeps the canonical source order and reports an unchecked source as unknown', () => {
    const merged = mergeAnalystSourceStatuses([
      sourceRecord('gsc', { status: 'missing', remediation: 'Add a credential.' }),
      sourceRecord('post_views'),
    ]);

    expect(merged.map((entry) => entry.source)).toEqual([
      'clicks',
      'post_views',
      'gsc',
      'ga4',
      'affiliate_report',
    ]);

    const [clicks, postViews, searchConsole, ga4] = merged;
    expect(clicks.status).toBe('unknown');
    expect(clicks.checkedAt).toBeNull();
    expect(clicks.remediation).not.toBe('');
    expect(postViews.status).toBe('ok');
    expect(searchConsole.status).toBe('missing');
    expect(searchConsole.remediation).toBe('Add a credential.');
    expect(searchConsole.checkedAt).toBe('2026-10-01T02:00:00.000Z');
    expect(ga4.status).toBe('unknown');
  });

  it('keeps the last row when a source is reported twice', () => {
    const merged = mergeAnalystSourceStatuses([
      sourceRecord('clicks', { rowCount: 1 }),
      sourceRecord('clicks', { rowCount: 9, checkedAt: '2026-10-02T02:00:00.000Z' }),
    ]);

    expect(merged[0].rowCount).toBe(9);
    expect(merged[0].checkedAt).toBe('2026-10-02T02:00:00.000Z');
  });
});
