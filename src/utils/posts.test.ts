import { describe, expect, it } from 'vitest';
import type { PostStatus } from '@/lib/content/post-schema';
import { collectTags, filterVisiblePosts, sortPostsByDateDesc } from './posts';

interface TestPost {
  id: string;
  data: { pubDate: Date; status: PostStatus; tags: string[] };
}

function buildPost(id: string, overrides: Partial<TestPost['data']> = {}): TestPost {
  return {
    id,
    data: {
      pubDate: new Date('2026-01-01T00:00:00Z'),
      status: 'published',
      tags: [],
      ...overrides,
    },
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

describe('filterVisiblePosts', () => {
  const published = buildPost('published', { status: 'published' });
  const draft = buildPost('draft', { status: 'draft' });
  const archived = buildPost('archived', { status: 'archived' });

  it('keeps only published posts when drafts are excluded', () => {
    expect(filterVisiblePosts([published, draft, archived], false).map((post) => post.id)).toEqual([
      'published',
    ]);
  });

  it('includes drafts but never archived posts when drafts are included', () => {
    expect(filterVisiblePosts([published, draft, archived], true).map((post) => post.id)).toEqual([
      'published',
      'draft',
    ]);
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
