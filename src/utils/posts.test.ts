import { describe, expect, it } from 'vitest';
import { collectTags, filterPublishedPosts, sortPostsByDateDesc } from './posts';

interface TestPost {
  id: string;
  data: { pubDate: Date; draft: boolean; tags: string[] };
}

function buildPost(id: string, overrides: Partial<TestPost['data']> = {}): TestPost {
  return {
    id,
    data: { pubDate: new Date('2026-01-01T00:00:00Z'), draft: false, tags: [], ...overrides },
  };
}

describe('sortPostsByDateDesc', () => {
  it('orders newest first without mutating the input', () => {
    const oldest = buildPost('oldest', { pubDate: new Date('2026-01-01T00:00:00Z') });
    const newest = buildPost('newest', { pubDate: new Date('2026-06-01T00:00:00Z') });
    const posts = [oldest, newest];

    const sorted = sortPostsByDateDesc(posts);

    expect(sorted.map((post) => post.id)).toEqual(['newest', 'oldest']);
    expect(posts.map((post) => post.id)).toEqual(['oldest', 'newest']);
  });
});

describe('filterPublishedPosts', () => {
  it('removes drafts when drafts are excluded', () => {
    const published = buildPost('published');
    const draft = buildPost('draft', { draft: true });

    const result = filterPublishedPosts([published, draft], false);

    expect(result.map((post) => post.id)).toEqual(['published']);
  });

  it('keeps drafts when drafts are included', () => {
    const published = buildPost('published');
    const draft = buildPost('draft', { draft: true });

    const result = filterPublishedPosts([published, draft], true);

    expect(result.map((post) => post.id)).toEqual(['published', 'draft']);
  });
});

describe('collectTags', () => {
  it('returns unique tags sorted alphabetically', () => {
    const first = buildPost('first', { tags: ['keyboard', 'monitor'] });
    const second = buildPost('second', { tags: ['monitor', 'audio'] });

    expect(collectTags([first, second])).toEqual(['audio', 'keyboard', 'monitor']);
  });

  it('returns an empty list when no tags exist', () => {
    expect(collectTags([buildPost('none')])).toEqual([]);
  });
});
