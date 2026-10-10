import { describe, expect, it } from 'vitest';
import { buildTableOfContents } from './toc';

describe('buildTableOfContents', () => {
  it('numbers sections and subsections', () => {
    const entries = buildTableOfContents([
      { depth: 2, slug: 'a', text: 'First' },
      { depth: 3, slug: 'a-1', text: 'First child' },
      { depth: 3, slug: 'a-2', text: 'Second child' },
      { depth: 2, slug: 'b', text: 'Second' },
    ]);

    expect(entries.map((entry) => entry.label)).toEqual(['01', '1.1', '1.2', '02']);
    expect(entries.map((entry) => entry.id)).toEqual(['a', 'a-1', 'a-2', 'b']);
  });

  it('ignores the top-level heading and anything deeper than the limit', () => {
    const entries = buildTableOfContents([
      { depth: 1, slug: 'title', text: 'Title' },
      { depth: 2, slug: 'a', text: 'First' },
      { depth: 4, slug: 'deep', text: 'Deep' },
    ]);

    expect(entries.map((entry) => entry.label)).toEqual(['01']);
  });

  it('skips a subsection that appears before any section', () => {
    const entries = buildTableOfContents([
      { depth: 3, slug: 'orphan', text: 'Orphan' },
      { depth: 2, slug: 'a', text: 'First' },
    ]);

    expect(entries.map((entry) => entry.label)).toEqual(['01']);
    expect(entries[0].isSub).toBe(false);
  });

  it('returns an empty list when there are no usable headings', () => {
    expect(buildTableOfContents([{ depth: 1, slug: 'only', text: 'Only' }])).toEqual([]);
  });
});
