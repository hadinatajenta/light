import { describe, expect, it } from 'vitest';
import { formatDate, toIsoDate } from './date';

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
