import { describe, expect, it } from 'vitest';
import { buildBudgetState, monthPrefix, readLimit, readRate, todayKey } from './budget';

const BASE = {
  paused: false,
  dailySearches: 40,
  monthlySearches: 1500,
  dailyTokens: 1000,
  dailyCovers: 20,
  searchUsedToday: 0,
  searchUsedThisMonth: 0,
  tokensUsedToday: 0,
  coversUsedToday: 0,
  freeCredits: 100,
  creditPriceUsd: 0.008,
};

describe('buildBudgetState', () => {
  it('uses the tighter of the daily and monthly search limits', () => {
    const state = buildBudgetState({ ...BASE, searchUsedThisMonth: 1490, searchUsedToday: 10 });

    expect(state.searchesRemaining).toBe(10);
    expect(state.searchesExhausted).toBe(false);
  });

  it('marks searches exhausted at the daily cap', () => {
    const state = buildBudgetState({ ...BASE, searchUsedToday: 40 });

    expect(state.searchesExhausted).toBe(true);
    expect(state.searchesRemaining).toBe(0);
  });

  it('marks tokens exhausted at the daily cap', () => {
    const state = buildBudgetState({ ...BASE, tokensUsedToday: 1000 });

    expect(state.tokensExhausted).toBe(true);
    expect(state.tokensRemaining).toBe(0);
  });

  it('keeps covers available under the daily cap', () => {
    const state = buildBudgetState({ ...BASE, coversUsedToday: 5 });

    expect(state.coversRemaining).toBe(15);
    expect(state.coversExhausted).toBe(false);
  });

  it('marks covers exhausted at or over the daily cap', () => {
    const atCap = buildBudgetState({ ...BASE, coversUsedToday: 20 });
    const overCap = buildBudgetState({ ...BASE, coversUsedToday: 25 });

    expect(atCap.coversExhausted).toBe(true);
    expect(atCap.coversRemaining).toBe(0);
    expect(overCap.coversExhausted).toBe(true);
    expect(overCap.coversRemaining).toBe(0);
  });

  it('never returns a negative remaining count', () => {
    const state = buildBudgetState({ ...BASE, searchUsedThisMonth: 9000, searchUsedToday: 900 });

    expect(state.searchesRemaining).toBe(0);
    expect(state.tokensRemaining).toBe(1000);
  });

  it('stays inside the free allowance with no paid usage or warning below the threshold', () => {
    const state = buildBudgetState({ ...BASE, searchUsedThisMonth: 50 });

    expect(state.freeCreditsRemaining).toBe(50);
    expect(state.paidCreditsUsed).toBe(0);
    expect(state.estimatedCostUsd).toBe(0);
    expect(state.paidMode).toBe(false);
    expect(state.warning).toBe(false);
  });

  it('warns at or above the free credit warning ratio', () => {
    const atThreshold = buildBudgetState({ ...BASE, searchUsedThisMonth: 80 });
    const aboveThreshold = buildBudgetState({ ...BASE, searchUsedThisMonth: 95 });

    expect(atThreshold.warning).toBe(true);
    expect(aboveThreshold.warning).toBe(true);
    expect(atThreshold.paidMode).toBe(false);
  });

  it('tracks paid credits and estimated cost once the free allowance is exceeded', () => {
    const state = buildBudgetState({ ...BASE, searchUsedThisMonth: 150 });

    expect(state.freeCreditsRemaining).toBe(0);
    expect(state.paidCreditsUsed).toBe(50);
    expect(state.estimatedCostUsd).toBeCloseTo(50 * BASE.creditPriceUsd, 10);
    expect(state.paidMode).toBe(true);
    expect(state.warning).toBe(false);
  });
});

describe('readLimit', () => {
  it('falls back on missing or invalid values', () => {
    expect(readLimit(null, 40)).toBe(40);
    expect(readLimit('abc', 40)).toBe(40);
    expect(readLimit('-5', 40)).toBe(40);
  });

  it('reads a valid stored limit', () => {
    expect(readLimit('12', 40)).toBe(12);
  });
});

describe('readRate', () => {
  it('parses a stored decimal', () => {
    expect(readRate('0.008', 0.01)).toBe(0.008);
  });

  it('falls back on missing, invalid, or negative values', () => {
    expect(readRate(null, 0.008)).toBe(0.008);
    expect(readRate('abc', 0.008)).toBe(0.008);
    expect(readRate('-0.5', 0.008)).toBe(0.008);
  });
});

describe('todayKey and monthPrefix', () => {
  it('formats the day and month from a date', () => {
    const now = new Date('2026-10-11T05:00:00.000Z');

    expect(todayKey(now)).toBe('2026-10-11');
    expect(monthPrefix(now)).toBe('2026-10');
  });
});
