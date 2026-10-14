import { describe, expect, it } from 'vitest';
import {
  ANALYST_FINDING_MISS_LIMIT,
  type AnalystFindingRecord,
  decideFindingUpsert,
  type FindingWriteContext,
  planFindingMiss,
  planFindingWrite,
} from './findings';
import type { AnalystCandidate } from './rules';
import { resolveAnalystWindow } from './window';

const WINDOW = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));
const NOW = '2026-03-15T00:00:00.000Z';

const CONTEXT: FindingWriteContext = {
  runId: 'run-1',
  agentId: 'agent-analyst-performance',
  window: WINDOW,
  nowIso: NOW,
  newId: 'new-finding',
};

function candidate(overrides: Partial<AnalystCandidate> = {}): AnalystCandidate {
  return {
    ruleId: 'no_affiliate_link',
    findingKey: 'chair-guide',
    subjectType: 'post',
    subjectId: 'chair-guide',
    title: 'No product links',
    detail: 'Detail',
    actionType: 'add_links',
    actionEffort: 'M',
    impact: 3,
    confidence: 0.9,
    prizeClicks: 2,
    evidence: { views: 20 },
    score: 92,
    dataQuality: { clicks: 'ok' },
    ...overrides,
  };
}

function record(overrides: Partial<AnalystFindingRecord> = {}): AnalystFindingRecord {
  return {
    id: 'finding-1',
    runId: 'run-0',
    agentId: 'agent-analyst-performance',
    ruleId: 'no_affiliate_link',
    findingKey: 'chair-guide',
    subjectType: 'post',
    subjectId: 'chair-guide',
    title: 'Old title',
    detail: 'Old detail',
    actionType: 'add_links',
    actionEffort: 'M',
    score: 50,
    impact: 3,
    confidence: 0.9,
    prizeClicks: 1,
    evidence: { views: 10 },
    dataQuality: { clicks: 'ok' },
    windowStart: '2026-01-01',
    windowEnd: '2026-01-28',
    baselineStart: '2025-12-04',
    baselineEnd: '2025-12-31',
    status: 'open',
    firstSeenAt: '2026-02-01T00:00:00.000Z',
    lastSeenAt: '2026-02-01T00:00:00.000Z',
    seenCount: 2,
    missedRuns: 0,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    dismissedUntil: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('decideFindingUpsert', () => {
  it('inserts when the key was never seen', () => {
    expect(decideFindingUpsert(null, NOW)).toBe('insert');
  });

  it('refreshes an open finding', () => {
    expect(decideFindingUpsert(record(), NOW)).toBe('refresh');
  });

  it('reopens a resolved or expired finding', () => {
    expect(decideFindingUpsert(record({ status: 'resolved' }), NOW)).toBe('refresh');
    expect(decideFindingUpsert(record({ status: 'expired' }), NOW)).toBe('refresh');
  });

  it('preserves an actioned finding', () => {
    expect(decideFindingUpsert(record({ status: 'actioned' }), NOW)).toBe('refresh-actioned');
  });

  it('preserves a dismissal that has not run out', () => {
    expect(
      decideFindingUpsert(
        record({ status: 'dismissed', dismissedUntil: '2026-04-01T00:00:00.000Z' }),
        NOW,
      ),
    ).toBe('refresh-dismissed');
  });

  it('refreshes a dismissal whose window has passed', () => {
    expect(
      decideFindingUpsert(
        record({ status: 'dismissed', dismissedUntil: '2026-03-01T00:00:00.000Z' }),
        NOW,
      ),
    ).toBe('refresh');
  });
});

describe('planFindingWrite', () => {
  it('inserts a new finding with fresh timestamps and a full count', () => {
    const planned = planFindingWrite(null, candidate(), CONTEXT);

    expect(planned.action).toBe('insert');
    expect(planned.values).toMatchObject({
      id: 'new-finding',
      ruleId: 'no_affiliate_link',
      findingKey: 'chair-guide',
      status: 'open',
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      seenCount: 1,
      missedRuns: 0,
      resolvedAt: null,
      dismissedUntil: null,
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      baselineStart: WINDOW.baselineStart,
      baselineEnd: WINDOW.baselineEnd,
      score: 92,
    });
  });

  it('updates an open finding without duplicating it', () => {
    const planned = planFindingWrite(record(), candidate(), CONTEXT);

    expect(planned.action).toBe('refresh');
    expect(planned.values).toMatchObject({
      id: 'finding-1',
      status: 'open',
      firstSeenAt: '2026-02-01T00:00:00.000Z',
      createdAt: '2026-02-01T00:00:00.000Z',
      lastSeenAt: NOW,
      seenCount: 3,
      evidence: { views: 20 },
      score: 92,
      windowStart: WINDOW.start,
    });
  });

  it('reopens a resolved finding and clears the resolution', () => {
    const planned = planFindingWrite(
      record({
        status: 'resolved',
        resolvedAt: '2026-03-01T00:00:00.000Z',
        resolvedBy: 'system',
        resolutionNote: 'Subject updated',
      }),
      candidate(),
      CONTEXT,
    );

    expect(planned.action).toBe('refresh');
    expect(planned.values).toMatchObject({
      status: 'open',
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      seenCount: 3,
    });
  });

  it('keeps an actioned finding actioned but records the new sighting', () => {
    const planned = planFindingWrite(
      record({
        status: 'actioned',
        resolvedAt: null,
        resolvedBy: 'planner-1',
        resolutionNote: 'Created topic topic-1',
      }),
      candidate(),
      CONTEXT,
    );

    expect(planned.action).toBe('refresh-actioned');
    expect(planned.values).toMatchObject({
      status: 'actioned',
      resolvedBy: 'planner-1',
      resolutionNote: 'Created topic topic-1',
      seenCount: 3,
      lastSeenAt: NOW,
      missedRuns: 0,
    });
  });

  it('keeps a live dismissal without resetting its window', () => {
    const planned = planFindingWrite(
      record({ status: 'dismissed', dismissedUntil: '2026-04-01T00:00:00.000Z' }),
      candidate(),
      CONTEXT,
    );

    expect(planned.action).toBe('refresh-dismissed');
    expect(planned.values).toMatchObject({
      status: 'dismissed',
      dismissedUntil: '2026-04-01T00:00:00.000Z',
      seenCount: 3,
    });
  });
});

describe('planFindingMiss', () => {
  it('counts misses and expires at the limit', () => {
    expect(planFindingMiss(0)).toEqual({ missedRuns: 1, expire: false });
    expect(planFindingMiss(1)).toEqual({ missedRuns: 2, expire: false });
    expect(planFindingMiss(2)).toEqual({ missedRuns: 3, expire: true });
    expect(planFindingMiss(ANALYST_FINDING_MISS_LIMIT)).toEqual({ missedRuns: 4, expire: true });
  });

  it('tolerates stored values below zero', () => {
    expect(planFindingMiss(-5)).toEqual({ missedRuns: 1, expire: false });
  });
});
