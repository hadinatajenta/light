import { describe, expect, it } from 'vitest';
import { buildBlogPagePath, paginateItems } from './pagination';

const items = Array.from({ length: 25 }, (_, index) => index + 1);

describe('paginateItems', () => {
  it('returns the requested slice and page metadata', () => {
    const result = paginateItems(items, 2, 10);

    expect(result.pageItems).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result.totalPages).toBe(3);
    expect(result.currentPage).toBe(2);
    expect(result.hasPreviousPage).toBe(true);
    expect(result.hasNextPage).toBe(true);
  });

  it('clamps a page beyond the range to the last page', () => {
    const result = paginateItems(items, 99, 10);

    expect(result.currentPage).toBe(3);
    expect(result.pageItems).toEqual([21, 22, 23, 24, 25]);
    expect(result.hasNextPage).toBe(false);
  });

  it('treats an empty list as a single empty page', () => {
    const result = paginateItems([], 1, 10);

    expect(result.totalPages).toBe(1);
    expect(result.pageItems).toEqual([]);
    expect(result.hasPreviousPage).toBe(false);
    expect(result.hasNextPage).toBe(false);
  });
});

describe('buildBlogPagePath', () => {
  it('points the first page at the blog index', () => {
    expect(buildBlogPagePath(1)).toBe('/blog/');
  });

  it('points later pages at the numbered path', () => {
    expect(buildBlogPagePath(3)).toBe('/blog/page/3/');
  });
});
