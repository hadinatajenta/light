import { describe, expect, it } from 'vitest';
import { rankSearchResults } from './rank-results';

describe('rankSearchResults', () => {
  it('prefers an authority source over a marketplace', () => {
    const ranked = rankSearchResults(
      [
        { title: 'Chair picks', url: 'https://amazon.com/dp/1', snippet: 'office chair height' },
        {
          title: 'OSHA workstation guidance',
          url: 'https://osha.gov/ergonomics',
          snippet: 'office chair height',
        },
      ],
      { title: 'Office chair height', keywords: ['office chair'] },
      2,
    );

    expect(ranked[0]?.url).toBe('https://osha.gov/ergonomics');
  });

  it('prefers an authority source over a marketplace listing host', () => {
    const ranked = rankSearchResults(
      [
        {
          title: 'Office chair listings',
          url: 'https://ebay.com/itm/1',
          snippet: 'office chair height',
        },
        {
          title: 'CDC office ergonomics',
          url: 'https://cdc.gov/ergonomics',
          snippet: 'office chair height',
        },
      ],
      { title: 'Office chair height', keywords: ['office chair'] },
      2,
    );

    expect(ranked[0]?.url).toBe('https://cdc.gov/ergonomics');
  });

  it('ranks a best-of listicle below a neutral informative page', () => {
    const ranked = rankSearchResults(
      [
        {
          title: 'Best office chairs of 2026',
          url: 'https://example.com/best-office-chairs',
          snippet: 'office chair height',
        },
        {
          title: 'Office chair ergonomics',
          url: 'https://example.com/ergonomics',
          snippet: 'office chair height',
        },
      ],
      { title: 'Office chair height', keywords: ['office chair'] },
      2,
    );

    expect(ranked[0]?.url).toBe('https://example.com/ergonomics');
  });

  it('ranks a coupon page below a neutral informative page', () => {
    const ranked = rankSearchResults(
      [
        {
          title: 'Office chair discounts',
          url: 'https://example.com/deals/office-chairs',
          snippet: 'office chair height',
        },
        {
          title: 'Office chair ergonomics',
          url: 'https://example.com/ergonomics',
          snippet: 'office chair height',
        },
      ],
      { title: 'Office chair height', keywords: ['office chair'] },
      2,
    );

    expect(ranked[0]?.url).toBe('https://example.com/ergonomics');
  });

  it('does not penalize discussion and reference sources', () => {
    const ranked = rankSearchResults(
      [
        { title: 'Used chairs', url: 'https://ebay.com/itm/1', snippet: 'chair height' },
        { title: 'Chair talk', url: 'https://reddit.com/r/ergonomics', snippet: 'chair height' },
        { title: 'Chair', url: 'https://wikipedia.org/wiki/Chair', snippet: 'chair height' },
      ],
      { title: 'Chair', keywords: [] },
      3,
    );

    expect(ranked.map((entry) => entry.url)).toEqual([
      'https://reddit.com/r/ergonomics',
      'https://wikipedia.org/wiki/Chair',
      'https://ebay.com/itm/1',
    ]);
  });

  it('limits the number of results', () => {
    const ranked = rankSearchResults(
      [
        { title: 'a', url: 'https://a.com', snippet: '' },
        { title: 'b', url: 'https://b.com', snippet: '' },
        { title: 'c', url: 'https://c.com', snippet: '' },
      ],
      { title: 'anything', keywords: [] },
      2,
    );

    expect(ranked).toHaveLength(2);
  });

  it('preserves extra fields on the result', () => {
    const ranked = rankSearchResults(
      [{ title: 'a', url: 'https://a.com', snippet: '', query: 'office chair' }],
      { title: 'a', keywords: [] },
      1,
    );

    expect(ranked[0]?.query).toBe('office chair');
  });
});
