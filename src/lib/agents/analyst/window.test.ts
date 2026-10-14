import { describe, expect, it } from 'vitest';
import { addViewDays } from '../../analytics/views';
import {
  ANALYST_BASELINE_DAYS,
  ANALYST_WINDOW_DAYS,
  jakartaDayStartIso,
  resolveAnalystWindow,
} from './window';

function dayCount(start: string, end: string): number {
  let count = 0;
  let current = start;

  while (current <= end) {
    count += 1;
    current = addViewDays(current, 1);
  }

  return count;
}

describe('resolveAnalystWindow', () => {
  it('ends on yesterday in Asia/Jakarta and spans 28 complete days', () => {
    const window = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));

    expect(window.timeZone).toBe('Asia/Jakarta');
    expect(window.end).toBe('2026-03-14');
    expect(window.start).toBe('2026-02-15');
    expect(window.days).toBe(ANALYST_WINDOW_DAYS);
    expect(dayCount(window.start, window.end)).toBe(ANALYST_WINDOW_DAYS);
  });

  it('places the 28 day baseline immediately before the window', () => {
    const window = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));

    expect(window.baselineEnd).toBe('2026-02-14');
    expect(window.baselineStart).toBe('2026-01-18');
    expect(dayCount(window.baselineStart, window.baselineEnd)).toBe(ANALYST_BASELINE_DAYS);
    expect(addViewDays(window.baselineEnd, 1)).toBe(window.start);
  });

  it('treats the Jakarta day as the boundary, not the UTC day', () => {
    const window = resolveAnalystWindow(new Date('2025-12-31T18:30:00.000Z'));

    expect(window.end).toBe('2025-12-31');
    expect(window.start).toBe('2025-12-04');
  });

  it('crosses the year boundary without drifting', () => {
    const window = resolveAnalystWindow(new Date('2026-01-05T02:00:00.000Z'));

    expect(window.end).toBe('2026-01-04');
    expect(window.start).toBe('2025-12-08');
    expect(window.baselineStart).toBe('2025-11-10');
    expect(window.baselineEnd).toBe('2025-12-07');
  });

  it('exposes UTC instants for the Jakarta day boundaries', () => {
    const window = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));

    expect(window.startIso).toBe('2026-02-14T17:00:00.000Z');
    expect(window.endExclusiveIso).toBe('2026-03-14T17:00:00.000Z');
    expect(window.baselineStartIso).toBe('2026-01-17T17:00:00.000Z');
    expect(window.baselineEndExclusiveIso).toBe('2026-02-14T17:00:00.000Z');
  });

  it('keeps the baseline exclusive range aligned with the window start', () => {
    const window = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));

    expect(window.baselineEndExclusiveIso).toBe(window.startIso);
  });

  it('handles a leap day inside the window', () => {
    const window = resolveAnalystWindow(new Date('2024-03-01T10:00:00.000Z'));

    expect(window.end).toBe('2024-02-29');
    expect(window.start).toBe('2024-02-02');
    expect(window.baselineEnd).toBe('2024-02-01');
  });
});

describe('jakartaDayStartIso', () => {
  it('subtracts the seven hour offset from the day key', () => {
    expect(jakartaDayStartIso('2026-10-13')).toBe('2026-10-12T17:00:00.000Z');
    expect(jakartaDayStartIso('2026-01-01')).toBe('2025-12-31T17:00:00.000Z');
  });
});
