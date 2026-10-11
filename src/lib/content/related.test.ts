import { describe, expect, it } from 'vitest';
import { scoreRelated, selectRelatedPosts } from './related';

interface Candidate {
  id: string;
  title: string;
  tags: string[];
  category: string | null;
}

const CANDIDATES: Candidate[] = [
  { id: 'current', title: 'Current post', tags: ['monitors'], category: 'monitors' },
  { id: 'strong', title: 'Strong match', tags: ['monitors', 'desks'], category: 'monitors' },
  { id: 'tags-only', title: 'Tags only', tags: ['monitors'], category: 'audio' },
  { id: 'category-only', title: 'Category only', tags: ['lighting'], category: 'monitors' },
  { id: 'unrelated', title: 'Unrelated post', tags: ['chairs'], category: 'chairs' },
];

describe('scoreRelated', () => {
  it('weights each shared tag at two points', () => {
    expect(
      scoreRelated(
        { tags: ['monitors', 'desks'], category: null },
        { tags: ['monitors', 'lighting'], category: null },
      ),
    ).toBe(2);
  });

  it('adds one point for a shared category', () => {
    expect(
      scoreRelated({ tags: [], category: 'monitors' }, { tags: [], category: 'monitors' }),
    ).toBe(1);
  });

  it('combines shared tags and a shared category', () => {
    expect(
      scoreRelated(
        { tags: ['monitors', 'desks'], category: 'monitors' },
        { tags: ['desks', 'lighting'], category: 'monitors' },
      ),
    ).toBe(3);
  });

  it('scores posts with nothing in common at zero', () => {
    expect(
      scoreRelated(
        { tags: ['monitors'], category: 'monitors' },
        { tags: ['chairs'], category: 'chairs' },
      ),
    ).toBe(0);
  });

  it('does not award a category point when both categories are null', () => {
    expect(scoreRelated({ tags: [], category: null }, { tags: [], category: null })).toBe(0);
  });
});

describe('selectRelatedPosts', () => {
  it('excludes the current post', () => {
    const result = selectRelatedPosts({ id: 'current' }, CANDIDATES, 4);
    expect(result.map((post) => post.id)).not.toContain('current');
  });

  it('drops candidates with no shared tags and no shared category', () => {
    const result = selectRelatedPosts({ id: 'current' }, CANDIDATES, 4);
    expect(result.map((post) => post.id)).not.toContain('unrelated');
  });

  it('orders by score descending', () => {
    const result = selectRelatedPosts({ id: 'current' }, CANDIDATES, 4);
    expect(result.map((post) => post.id)).toEqual(['strong', 'tags-only', 'category-only']);
  });

  it('breaks score ties by title ascending', () => {
    const tied: Candidate[] = [
      { id: 'current', title: 'Current post', tags: ['x'], category: null },
      { id: 'beta', title: 'Beta', tags: ['x'], category: null },
      { id: 'alpha', title: 'Alpha', tags: ['x'], category: null },
    ];

    const result = selectRelatedPosts({ id: 'current' }, tied, 4);
    expect(result.map((post) => post.id)).toEqual(['alpha', 'beta']);
  });

  it('slices the result to the limit', () => {
    const result = selectRelatedPosts({ id: 'current' }, CANDIDATES, 2);
    expect(result.map((post) => post.id)).toEqual(['strong', 'tags-only']);
  });

  it('scores against a current post that carries its own tags and category', () => {
    const currentPost = { id: 'current', tags: ['monitors'], category: 'monitors' };
    const result = selectRelatedPosts(currentPost, CANDIDATES, 4);
    expect(result.map((post) => post.id)).toEqual(['strong', 'tags-only', 'category-only']);
  });

  it('returns nothing when no candidate scores above zero', () => {
    const strangers: Candidate[] = [
      { id: 'current', title: 'Current post', tags: ['monitors'], category: 'monitors' },
      { id: 'other', title: 'Other post', tags: ['chairs'], category: 'chairs' },
    ];

    expect(selectRelatedPosts({ id: 'current' }, strangers, 4)).toEqual([]);
  });
});
