import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange, formatRelativeTime, toIsoDate } from './date';

describe('formatDate', () => {
  it('formats a date in long en-US form', () => {
    expect(formatDate(new Date('2026-03-04T00:00:00Z'))).toBe('March 4, 2026');
  });

  it('keeps the UTC day even for a late timestamp', () => {
    expect(formatDate(new Date('2026-03-04T23:30:00Z'))).toBe('March 4, 2026');
  });
});

describe('toIsoDate', () => {
  it('returns only the date portion', () => {
    expect(toIsoDate(new Date('2026-03-04T23:30:00Z'))).toBe('2026-03-04');
  });
});

describe('formatDateRange', () => {
  it('joins the start month-day with the end month-day-year', () => {
    expect(
      formatDateRange(new Date('2026-07-12T00:00:00Z'), new Date('2026-08-10T00:00:00Z')),
    ).toBe('Jul 12 - Aug 10, 2026');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');

  it('collapses the last minute to "just now"', () => {
    expect(formatRelativeTime('2026-10-10T11:59:30Z', now)).toBe('just now');
  });

  it('counts minutes, hours, days, and weeks', () => {
    expect(formatRelativeTime('2026-10-10T11:15:00Z', now)).toBe('45m ago');
    expect(formatRelativeTime('2026-10-10T06:00:00Z', now)).toBe('6h ago');
    expect(formatRelativeTime('2026-10-07T12:00:00Z', now)).toBe('3d ago');
    expect(formatRelativeTime('2026-09-26T12:00:00Z', now)).toBe('2w ago');
  });

  it('falls back to an absolute date beyond five weeks', () => {
    expect(formatRelativeTime('2026-08-01T12:00:00Z', now)).toBe('August 1, 2026');
  });

  it('returns "unknown" for an invalid timestamp', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('unknown');
  });
});
