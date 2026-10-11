import { describe, expect, it } from 'vitest';
import { truncateRunOutput } from './research-overview';

describe('truncateRunOutput', () => {
  it('returns null for null output', () => {
    expect(truncateRunOutput(null)).toBeNull();
  });

  it('returns null for empty output', () => {
    expect(truncateRunOutput('')).toBeNull();
  });

  it('returns short output unchanged', () => {
    expect(truncateRunOutput('run finished cleanly')).toBe('run finished cleanly');
  });

  it('slices output longer than the default limit', () => {
    const longOutput = 'a'.repeat(7000);

    expect(truncateRunOutput(longOutput)).toHaveLength(6000);
  });

  it('slices output to an explicit limit', () => {
    expect(truncateRunOutput('abcdef', 3)).toBe('abc');
  });

  it('keeps output that exactly matches the limit', () => {
    expect(truncateRunOutput('abcd', 4)).toBe('abcd');
  });
});
