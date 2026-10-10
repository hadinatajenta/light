import { describe, expect, it } from 'vitest';
import { buildDailySeries, countByRecency, formatDelta } from './metrics';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysBefore(days: number): string {
  return new Date(NOW - days * DAY_IN_MS).toISOString();
}

describe('countByRecency', () => {
  it('splits dates into the recent window, the previous window, and older', () => {
    const counts = countByRecency(
      [daysBefore(1), daysBefore(20), daysBefore(35), daysBefore(50), daysBefore(90)],
      30,
      NOW,
    );

    expect(counts).toEqual({ total: 5, recent: 2, previous: 2 });
  });

  it('ignores empty and invalid dates but still counts valid totals', () => {
    const counts = countByRecency([null, '', 'not-a-date', daysBefore(5)], 30, NOW);

    expect(counts).toEqual({ total: 1, recent: 1, previous: 0 });
  });

  it('counts a future date in the total but in neither window', () => {
    const counts = countByRecency([new Date(NOW + DAY_IN_MS).toISOString()], 30, NOW);

    expect(counts).toEqual({ total: 1, recent: 0, previous: 0 });
  });
});

describe('buildDailySeries', () => {
  it('places a fresh date in the last bucket and an old date in the first', () => {
    const series = buildDailySeries([daysBefore(0), daysBefore(6)], 7, NOW);

    expect(series).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });

  it('drops dates older than the window', () => {
    const series = buildDailySeries([daysBefore(7), daysBefore(30)], 7, NOW);

    expect(series).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('returns a zero-filled series of the requested length', () => {
    expect(buildDailySeries([], 30, NOW)).toHaveLength(30);
  });
});

describe('formatDelta', () => {
  it('signs a positive and a negative difference', () => {
    expect(formatDelta(5, 3)).toBe('+2');
    expect(formatDelta(2, 6)).toBe('-4');
  });

  it('reports no change when equal', () => {
    expect(formatDelta(4, 4)).toBe('No change');
  });
});
