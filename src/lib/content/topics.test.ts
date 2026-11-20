import { describe, expect, it } from 'vitest';
import type { SitePostSummary } from './public';
import {
  isIndexableTopic,
  listIndexableTopics,
  listTopicPosts,
  MIN_INDEXABLE_TOPIC_POSTS,
} from './topics';

function buildSummary(overrides: Partial<SitePostSummary> & { id: string }): SitePostSummary {
  return {
    title: overrides.id,
    description: '',
    tags: [],
    category: null,
    status: 'published',
    pubDate: null,
    updatedDate: null,
    coverUrl: null,
    coverAlt: null,
    ...overrides,
  };
}

const POSTS: SitePostSummary[] = [
  buildSummary({ id: 'tagged', tags: ['monitors'], pubDate: '2026-03-01' }),
  buildSummary({
    id: 'categorized',
    category: 'monitors',
    pubDate: '2026-01-01',
    updatedDate: '2026-06-15',
  }),
  buildSummary({
    id: 'both',
    tags: ['monitors', 'audio'],
    category: 'monitors',
    pubDate: '2026-05-01',
  }),
  buildSummary({ id: 'audio-one', tags: ['audio'], pubDate: '2026-02-01' }),
  buildSummary({ id: 'phone-one', tags: ['phones'], pubDate: '2026-02-01' }),
  buildSummary({ id: 'phone-two', tags: ['phones'], pubDate: '2026-02-02' }),
  buildSummary({ id: 'phone-three', category: 'phones', pubDate: '2026-02-03' }),
];

describe('isIndexableTopic', () => {
  it('accepts an allowed slug at the minimum post count', () => {
    expect(isIndexableTopic('monitors', MIN_INDEXABLE_TOPIC_POSTS)).toBe(true);
    expect(isIndexableTopic('monitors', 3)).toBe(true);
  });

  it('rejects an allowed slug below the minimum post count', () => {
    expect(isIndexableTopic('monitors', 2)).toBe(false);
  });

  it('rejects a slug outside the allowed list', () => {
    expect(isIndexableTopic('phones', 10)).toBe(false);
  });
});

describe('listIndexableTopics', () => {
  it('counts posts by tag and category the same way listTopicPosts does', () => {
    const monitors = listIndexableTopics(POSTS).find((topic) => topic.slug === 'monitors');

    expect(monitors?.count).toBe(listTopicPosts(POSTS, 'monitors').length);
    expect(monitors?.count).toBe(3);
    expect(monitors?.label).toBe('Monitors');
  });

  it('uses the newest updated or published date among the topic posts', () => {
    const monitors = listIndexableTopics(POSTS).find((topic) => topic.slug === 'monitors');

    expect(monitors?.lastModified).toBe('2026-06-15');
  });

  it('returns no date when no topic post has one', () => {
    const undatedPosts = ['first', 'second', 'third'].map((id) =>
      buildSummary({ id, tags: ['chairs'] }),
    );

    expect(listIndexableTopics(undatedPosts)).toEqual([
      { slug: 'chairs', label: 'Chairs', count: 3, lastModified: undefined },
    ]);
  });

  it('excludes topics below the minimum post count', () => {
    const slugs = listIndexableTopics(POSTS).map((topic) => topic.slug);

    expect(listTopicPosts(POSTS, 'audio')).toHaveLength(2);
    expect(slugs).not.toContain('audio');
  });

  it('excludes slugs outside the allowed list', () => {
    const slugs = listIndexableTopics(POSTS).map((topic) => topic.slug);

    expect(listTopicPosts(POSTS, 'phones')).toHaveLength(3);
    expect(slugs).not.toContain('phones');
    expect(slugs).toEqual(['monitors']);
  });
});
