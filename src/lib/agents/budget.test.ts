import { describe, expect, it } from 'vitest';
import { buildBudgetState, monthPrefix, readLimit, todayKey } from './budget';

const BASE = {
  paused: false,
  dailySearches: 40,
  monthlySearches: 1500,
  dailyTokens: 1000,
  searchUsedToday: 0,
  searchUsedThisMonth: 0,
  tokensUsedToday: 0,
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

  it('never returns a negative remaining count', () => {
    const state = buildBudgetState({ ...BASE, searchUsedThisMonth: 9000, searchUsedToday: 900 });

    expect(state.searchesRemaining).toBe(0);
    expect(state.tokensRemaining).toBe(1000);
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

describe('todayKey and monthPrefix', () => {
  it('formats the day and month from a date', () => {
    const now = new Date('2026-10-11T05:00:00.000Z');

    expect(todayKey(now)).toBe('2026-10-11');
    expect(monthPrefix(now)).toBe('2026-10');
  });
});
