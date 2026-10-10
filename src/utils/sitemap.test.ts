import { describe, expect, it } from 'vitest';
import { collectPaginationPaths, collectTagPaths, toLastModified } from './sitemap';

describe('toLastModified', () => {
  it('returns the UTC date portion of a valid timestamp', () => {
    expect(toLastModified('2026-10-08T23:30:00.000Z')).toBe('2026-10-08');
  });

  it('returns undefined for empty or invalid input', () => {
    expect(toLastModified(null)).toBeUndefined();
    expect(toLastModified('')).toBeUndefined();
    expect(toLastModified('not-a-date')).toBeUndefined();
  });
});

describe('collectTagPaths', () => {
  it('keeps only tags that reach the minimum post count', () => {
    const paths = collectTagPaths(
      [{ tags: ['audio', 'desk'] }, { tags: ['audio'] }, { tags: ['desk'] }, { tags: ['solo'] }],
      2,
    );

    expect(paths).toEqual(['/tag/audio/', '/tag/desk/']);
  });

  it('returns an empty list when no tag reaches the minimum', () => {
    expect(collectTagPaths([{ tags: ['solo'] }], 2)).toEqual([]);
  });
});

describe('collectPaginationPaths', () => {
  it('lists every page after the first', () => {
    expect(collectPaginationPaths(25, 9)).toEqual(['/blog/page/2/', '/blog/page/3/']);
  });

  it('returns nothing when everything fits on the first page', () => {
    expect(collectPaginationPaths(7, 9)).toEqual([]);
  });

  it('guards against a non-positive page size', () => {
    expect(collectPaginationPaths(10, 0)).toEqual([]);
  });
});
