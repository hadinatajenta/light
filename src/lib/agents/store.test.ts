import { describe, expect, it } from 'vitest';
import { MAX_RUNS_PER_DAY } from './roles';
import { computeNextRunAt } from './store';

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
});
