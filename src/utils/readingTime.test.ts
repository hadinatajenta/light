import { describe, expect, it } from 'vitest';
import { calculateReadingTimeMinutes, countWords, formatReadingTime } from './readingTime';

describe('countWords', () => {
  it('counts words while ignoring repeated whitespace', () => {
    expect(countWords('  one   two\nthree ')).toBe(3);
  });

  it('returns zero for blank input', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('calculateReadingTimeMinutes', () => {
  it('returns a minimum of one minute for short text', () => {
    expect(calculateReadingTimeMinutes('short text')).toBe(1);
  });

  it('rounds up to the next whole minute', () => {
    const longText = Array.from({ length: 401 }, (_, index) => `word${index}`).join(' ');
    expect(calculateReadingTimeMinutes(longText)).toBe(3);
  });
});

describe('formatReadingTime', () => {
  it('renders a human label', () => {
    expect(formatReadingTime(4)).toBe('4 min read');
  });
});
