import { describe, expect, it, vi } from 'vitest';
import type { PostSummary } from './types';

const listPosts = vi.fn<() => Promise<PostSummary[]>>();

vi.mock('./store', () => ({
  getPost: async () => null,
  listPosts: () => listPosts(),
}));

import { getPublishedPostSummaries } from './public';

function summary(id: string, overrides: Partial<PostSummary> = {}): PostSummary {
  return {
    id,
    path: `d1:${id}`,
    sha: '2026-11-14T00:00:00.000Z',
    title: id,
    description: '',
    status: 'published',
    category: null,
    tags: [],
    coverUrl: null,
    coverAlt: null,
    pubDate: '2026-11-14T00:00:00.000Z',
    updatedDate: null,
    ...overrides,
  };
}

describe('getPublishedPostSummaries', () => {
  it('lists published posts and leaves out noindex and unpublished posts', async () => {
    listPosts.mockResolvedValue([
      summary('standing-desk-guide'),
      summary('gemini-model-news', { noindex: true }),
      summary('draft-chair-guide', { status: 'draft' }),
      summary('archived-lamp-guide', { status: 'archived' }),
      summary('monitor-arm-guide', { noindex: false }),
    ]);

    const posts = await getPublishedPostSummaries();

    expect(posts.map((post) => post.id)).toEqual(['standing-desk-guide', 'monitor-arm-guide']);
  });
});
