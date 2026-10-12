import { describe, expect, it } from 'vitest';
import {
  evaluateDailyQuota,
  nextPublishSlot,
  selectCatchUpRoles,
  shouldPublishNow,
  startOfWibDay,
} from './quota';

describe('startOfWibDay', () => {
  it('returns midnight WIB as a UTC instant', () => {
    const now = new Date('2026-10-12T18:30:00.000Z');

    expect(startOfWibDay(now).toISOString()).toBe('2026-10-12T17:00:00.000Z');
  });

  it('keeps the WIB day boundary across UTC midnight', () => {
    const beforeUtcMidnight = new Date('2026-10-12T16:59:59.000Z');
    const afterUtcMidnight = new Date('2026-10-12T17:00:01.000Z');

    expect(startOfWibDay(beforeUtcMidnight).toISOString()).toBe('2026-10-11T17:00:00.000Z');
    expect(startOfWibDay(afterUtcMidnight).toISOString()).toBe('2026-10-12T17:00:00.000Z');
  });
});

describe('evaluateDailyQuota', () => {
  it('reports the remaining count while behind', () => {
    expect(evaluateDailyQuota(2, 5)).toEqual({
      target: 5,
      publishedToday: 2,
      remaining: 3,
      behind: true,
    });
  });

  it('is satisfied once the target is reached or passed', () => {
    expect(evaluateDailyQuota(5, 5).behind).toBe(false);
    expect(evaluateDailyQuota(7, 5).behind).toBe(false);
    expect(evaluateDailyQuota(7, 5).remaining).toBe(0);
  });
});

describe('nextPublishSlot', () => {
  it('allows the first publish immediately', () => {
    const now = new Date('2026-10-12T10:00:00.000Z');

    expect(nextPublishSlot(null, 60 * 60_000, now).toISOString()).toBe(now.toISOString());
  });

  it('waits out the gap after a recent publish', () => {
    const now = new Date('2026-10-12T10:00:00.000Z');
    const lastPublished = new Date('2026-10-12T09:30:00.000Z');

    expect(nextPublishSlot(lastPublished, 60 * 60_000, now).toISOString()).toBe(
      '2026-10-12T10:30:00.000Z',
    );
  });

  it('publishes now when the gap has already passed', () => {
    const now = new Date('2026-10-12T10:00:00.000Z');
    const lastPublished = new Date('2026-10-12T08:00:00.000Z');

    expect(shouldPublishNow(lastPublished, 60 * 60_000, now)).toBe(true);
    expect(shouldPublishNow(new Date('2026-10-12T09:30:00.000Z'), 60 * 60_000, now)).toBe(false);
  });
});

describe('selectCatchUpRoles', () => {
  const BASE = {
    openTopics: 0,
    researchedTopics: 0,
    pendingDrafts: 0,
    revisionDrafts: 0,
    searchesRemaining: 10,
  };

  it('researches while topics are open and search budget remains', () => {
    expect(selectCatchUpRoles({ ...BASE, openTopics: 4 })).toEqual(['scrapper']);
  });

  it('skips research when the search budget is exhausted', () => {
    expect(selectCatchUpRoles({ ...BASE, openTopics: 4, searchesRemaining: 0 })).toEqual([]);
  });

  it('drafts from researched topics and revisions', () => {
    expect(selectCatchUpRoles({ ...BASE, researchedTopics: 2 })).toEqual(['writer']);
    expect(selectCatchUpRoles({ ...BASE, revisionDrafts: 1 })).toEqual(['writer']);
  });

  it('runs both review gates on pending drafts', () => {
    expect(selectCatchUpRoles({ ...BASE, pendingDrafts: 3 })).toEqual(['qc', 'reviewer']);
  });

  it('falls back to the planner when nothing else has work', () => {
    expect(selectCatchUpRoles(BASE)).toEqual(['planner']);
  });
});
