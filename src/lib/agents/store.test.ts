import { describe, expect, it } from 'vitest';
import { AGENT_ROLES, MAX_AGENTS_BY_ROLE, MAX_RUNS_PER_DAY, MIN_RUNS_PER_DAY } from './roles';
import { computeNextRunAt, hasRepeatedFailures } from './store';

const FROM = new Date('2026-10-11T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

describe('computeNextRunAt', () => {
  it('spreads one run per day across a full day', () => {
    expect(computeNextRunAt(1, FROM)).toBe(new Date(FROM.getTime() + 24 * HOUR_MS).toISOString());
  });

  it('shortens the interval as runs per day grows', () => {
    expect(computeNextRunAt(4, FROM)).toBe(new Date(FROM.getTime() + 6 * HOUR_MS).toISOString());
    expect(computeNextRunAt(24, FROM)).toBe(new Date(FROM.getTime() + HOUR_MS).toISOString());
  });

  it('clamps values below one and above the cap', () => {
    expect(computeNextRunAt(0, FROM)).toBe(computeNextRunAt(1, FROM));
    expect(computeNextRunAt(1000, FROM)).toBe(computeNextRunAt(MAX_RUNS_PER_DAY, FROM));
  });

  it('supports the fifteen minute cadence at the cap', () => {
    expect(computeNextRunAt(MAX_RUNS_PER_DAY, FROM)).toBe(
      new Date(FROM.getTime() + 15 * 60 * 1000).toISOString(),
    );
  });

  it('schedules the claim past the claim time for every cadence', () => {
    for (let runsPerDay = MIN_RUNS_PER_DAY; runsPerDay <= MAX_RUNS_PER_DAY; runsPerDay += 1) {
      const nextRunAt = computeNextRunAt(runsPerDay, FROM);

      expect(new Date(nextRunAt).getTime()).toBeGreaterThan(FROM.getTime());
    }
  });
});

describe('hasRepeatedFailures', () => {
  it('detects three failed runs in a row', () => {
    expect(hasRepeatedFailures(['failed', 'failed', 'failed'])).toBe(true);
  });

  it('ignores a streak shorter than three runs', () => {
    expect(hasRepeatedFailures([])).toBe(false);
    expect(hasRepeatedFailures(['failed'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed'])).toBe(false);
  });

  it('breaks the streak when any run did not fail', () => {
    expect(hasRepeatedFailures(['failed', 'succeeded', 'failed'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed', 'skipped'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed', 'running'])).toBe(false);
  });

  it('requires exactly the three newest runs', () => {
    expect(hasRepeatedFailures(['failed', 'failed', 'failed', 'failed'])).toBe(false);
  });
});

describe('MAX_AGENTS_BY_ROLE', () => {
  it('caps writers at four and every other role at two', () => {
    expect(MAX_AGENTS_BY_ROLE.writer).toBe(4);
    expect(MAX_AGENTS_BY_ROLE.planner).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.scrapper).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.qc).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.reviewer).toBe(2);
  });

  it('defines a limit for every agent role', () => {
    for (const role of AGENT_ROLES) {
      expect(MAX_AGENTS_BY_ROLE[role]).toBeGreaterThan(0);
    }
  });
});
