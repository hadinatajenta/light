import { describe, expect, it } from 'vitest';
import { SITE_TITLE } from '../consts';
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildCanonicalUrl,
  buildFaqJsonLd,
  buildPageTitle,
} from './seo';

describe('buildPageTitle', () => {
  it('falls back to the site title when no page title is given', () => {
    expect(buildPageTitle()).toBe(SITE_TITLE);
  });

  it('appends the site title to a page title', () => {
    expect(buildPageTitle('Best Keyboards')).toBe(`Best Keyboards | ${SITE_TITLE}`);
  });
});

describe('buildCanonicalUrl', () => {
  it('resolves a path against the site origin', () => {
    expect(buildCanonicalUrl(new URL('https://example.com'), '/blog/')).toBe(
      'https://example.com/blog/',
    );
  });

  it('returns undefined when the site origin is unknown', () => {
    expect(buildCanonicalUrl(undefined, '/blog/')).toBeUndefined();
  });
});

describe('buildArticleJsonLd', () => {
  it('uses the published date as the modified date when none is provided', () => {
    const published = new Date('2026-02-01T00:00:00Z');

    const jsonLd = buildArticleJsonLd({
      title: 'Title',
      description: 'Description',
      url: 'https://example.com/blog/post/',
      datePublished: published,
      authorName: 'Light Editorial Team',
    });

    expect(jsonLd['@type']).toBe('Article');
    expect(jsonLd.datePublished).toBe(published.toISOString());
    expect(jsonLd.dateModified).toBe(published.toISOString());
    expect(jsonLd.image).toBeUndefined();
  });

  it('includes the image only when provided', () => {
    const jsonLd = buildArticleJsonLd({
      title: 'Title',
      description: 'Description',
      url: 'https://example.com/blog/post/',
      datePublished: new Date('2026-02-01T00:00:00Z'),
      authorName: 'Light Editorial Team',
      image: 'https://example.com/cover.png',
    });

    expect(jsonLd.image).toEqual(['https://example.com/cover.png']);
  });
});

describe('buildFaqJsonLd', () => {
  it('maps questions to a FAQ page structure', () => {
    const jsonLd = buildFaqJsonLd([{ question: 'Is it good?', answer: 'Yes.' }]);
    const entities = jsonLd.mainEntity as Array<Record<string, unknown>>;

    expect(jsonLd['@type']).toBe('FAQPage');
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe('Is it good?');
  });
});

describe('buildBreadcrumbJsonLd', () => {
  it('assigns an increasing position to each item', () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { name: 'Home', url: 'https://example.com/' },
      { name: 'Blog', url: 'https://example.com/blog/' },
    ]);
    const items = jsonLd.itemListElement as Array<Record<string, unknown>>;

    expect(items.map((item) => item.position)).toEqual([1, 2]);
  });
});
