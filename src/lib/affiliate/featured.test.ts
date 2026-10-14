import { describe, expect, it } from 'vitest';
import {
  extractReferencedProducts,
  FEATURED_PRODUCT_LIMIT,
  isGenericLinkLabel,
  normalizeLinkLabel,
  selectFeaturedProducts,
  shortenFeaturedNote,
} from './featured';
import type { AffiliateProduct } from './store';

function buildProduct(overrides: Partial<AffiliateProduct> & { slug: string }): AffiliateProduct {
  return {
    id: overrides.slug,
    name: 'Unnamed product',
    programId: 'amazon',
    target: 'B000000000',
    priceAmount: null,
    priceCurrency: null,
    imageUrl: null,
    notes: null,
    topics: [],
    isActive: true,
    lastCheckedAt: null,
    ...overrides,
  };
}

const MONITOR_ARM = buildProduct({
  slug: 'mountup-dual-monitor-arm',
  name: 'MOUNTUP dual monitor desk mount',
  topics: ['monitors', 'desk-setup'],
});
const VIEWPRO = buildProduct({
  slug: 'viewpro-27-monitor',
  name: 'ViewPro 27-inch monitor',
  topics: ['monitors'],
  notes: 'A 27-inch panel that holds its brightness in a bright room.',
});
const DESK_MAT = buildProduct({
  slug: 'rocalt-standing-mat',
  name: 'Rocalt cushioned standing mat',
  topics: ['chairs'],
});
const MONITOR_LIGHT = buildProduct({
  slug: 'quntis-monitor-light',
  name: 'Quntis eye-care monitor light bar',
  topics: ['lighting'],
});

const CATALOG = [MONITOR_ARM, VIEWPRO, DESK_MAT, MONITOR_LIGHT];

describe('normalizeLinkLabel', () => {
  it('drops a leading determiner so the label reads as a line item', () => {
    expect(normalizeLinkLabel('the EPOMAKER silent switches')).toBe('EPOMAKER silent switches');
    expect(normalizeLinkLabel('a portable laptop riser')).toBe('Portable laptop riser');
  });

  it('keeps a label that is already clean', () => {
    expect(normalizeLinkLabel('MOUNTUP Dual Monitor Desk Mount')).toBe(
      'MOUNTUP Dual Monitor Desk Mount',
    );
  });

  it('capitalizes a lower-case label', () => {
    expect(normalizeLinkLabel('monitor light bar')).toBe('Monitor light bar');
  });

  it('collapses whitespace', () => {
    expect(normalizeLinkLabel('  desk   lamp  ')).toBe('Desk lamp');
  });
});

describe('isGenericLinkLabel', () => {
  it('recognizes labels that tell the reader nothing', () => {
    expect(isGenericLinkLabel('Check availability')).toBe(true);
    expect(isGenericLinkLabel('view product details')).toBe(true);
    expect(isGenericLinkLabel('Check the current specifications')).toBe(true);
  });

  it('does not flag a real product name', () => {
    expect(isGenericLinkLabel('MOUNTUP Dual Monitor Desk Mount')).toBe(false);
  });
});

describe('extractReferencedProducts', () => {
  it('reads each reference once, in order of first appearance', () => {
    const body = [
      'See [the first arm](product:mountup-dual-monitor-arm).',
      'Then [a monitor](product:viewpro-27-monitor).',
      'Again [the first arm](product:mountup-dual-monitor-arm).',
    ].join('\n');

    expect(extractReferencedProducts(body)).toEqual([
      { slug: 'mountup-dual-monitor-arm', label: 'First arm' },
      { slug: 'viewpro-27-monitor', label: 'Monitor' },
    ]);
  });

  it('reports a generic label as nothing so the catalogue name can be used', () => {
    const body = '[Check availability](product:viewpro-27-monitor)';

    expect(extractReferencedProducts(body)).toEqual([{ slug: 'viewpro-27-monitor', label: null }]);
  });

  it('ignores ordinary links', () => {
    expect(extractReferencedProducts('[docs](/about/) and [site](https://example.com)')).toEqual(
      [],
    );
  });
});

describe('shortenFeaturedNote', () => {
  it('returns nothing for an empty note', () => {
    expect(shortenFeaturedNote(null)).toBeNull();
    expect(shortenFeaturedNote('   ')).toBeNull();
  });

  it('bounds a long note', () => {
    const note = shortenFeaturedNote('x'.repeat(400));

    expect(note).not.toBeNull();
    expect((note ?? '').length).toBeLessThanOrEqual(160);
  });
});

describe('selectFeaturedProducts', () => {
  const select = (
    overrides: Partial<Parameters<typeof selectFeaturedProducts>[0]> & {
      products: AffiliateProduct[];
    },
  ) =>
    selectFeaturedProducts({
      body: '',
      title: '',
      tags: [],
      category: null,
      ...overrides,
    });

  it('lists the products the article already references', () => {
    const body =
      'A [MOUNTUP dual monitor desk mount](product:mountup-dual-monitor-arm) works here.';

    const featured = select({ body, category: 'monitors', products: CATALOG });

    expect(featured[0]).toEqual({
      slug: 'mountup-dual-monitor-arm',
      label: 'MOUNTUP dual monitor desk mount',
      note: null,
      matchedBy: 'reference',
    });
  });

  it('tops up from the catalogue when the article references nothing', () => {
    const featured = select({ category: 'monitors', products: CATALOG });

    expect(featured.map((entry) => entry.slug)).toEqual([
      'mountup-dual-monitor-arm',
      'viewpro-27-monitor',
    ]);
    expect(featured.every((entry) => entry.matchedBy === 'category')).toBe(true);
  });

  it('never repeats a product that was already referenced', () => {
    const body = '[Arm](product:mountup-dual-monitor-arm)';

    const featured = select({ body, category: 'monitors', products: CATALOG });

    expect(featured.map((entry) => entry.slug)).toEqual([
      'mountup-dual-monitor-arm',
      'viewpro-27-monitor',
    ]);
  });

  it('ranks the top-up by how well the product name matches the article', () => {
    const microphone = buildProduct({
      slug: 'blue-yeti-microphone',
      name: 'Blue Yeti USB microphone',
      topics: ['audio'],
    });
    const headphones = buildProduct({
      slug: 'soundcore-headphones',
      name: 'soundcore noise-cancelling headphones',
      topics: ['audio'],
    });

    const featured = select({
      title: 'What actually matters in noise-cancelling headphones',
      tags: ['headphones', 'noise-cancelling'],
      category: 'audio',
      products: [microphone, headphones],
    });

    expect(featured.map((entry) => entry.slug)).toEqual([
      'soundcore-headphones',
      'blue-yeti-microphone',
    ]);
  });

  it('walks up the limit and stops', () => {
    const featured = select({
      category: 'monitors',
      products: [...CATALOG, buildProduct({ slug: 'extra', name: 'Extra', topics: ['monitors'] })],
      limit: 2,
    });

    expect(featured).toHaveLength(2);
  });

  it('does not top up when the article has no category', () => {
    expect(select({ products: CATALOG })).toEqual([]);
  });

  it('ignores a reference to a product that is not linkable', () => {
    const featured = select({
      body: '[Gone](product:withdrawn-product)',
      category: 'chairs',
      products: CATALOG,
    });

    expect(featured.map((entry) => entry.slug)).toEqual(['rocalt-standing-mat']);
  });

  it('caps the referenced list at the limit', () => {
    const body = CATALOG.map((product) => `[${product.name}](product:${product.slug})`).join(' ');

    const featured = select({ body, category: 'monitors', products: CATALOG });

    expect(featured).toHaveLength(FEATURED_PRODUCT_LIMIT);
  });

  it('carries a note through so the list can justify the pick', () => {
    const featured = select({
      body: '[Panel](product:viewpro-27-monitor)',
      category: 'monitors',
      products: CATALOG,
    });

    expect(featured[0].note).toBe('A 27-inch panel that holds its brightness in a bright room.');
  });

  it('tops up from a tag when the category holds no products', () => {
    const featured = select({
      category: 'buying-basics',
      tags: ['eye-strain'],
      products: CATALOG,
    });

    expect(featured.map((entry) => entry.slug)).toEqual(['quntis-monitor-light']);
  });

  it('keeps a body reference ahead of a tag match', () => {
    const body = '[Rocalt cushioned standing mat](product:rocalt-standing-mat)';

    const featured = select({
      body,
      category: 'buying-basics',
      tags: ['eye-strain'],
      products: CATALOG,
    });

    expect(featured.map((entry) => entry.slug)).toEqual([
      'rocalt-standing-mat',
      'quntis-monitor-light',
    ]);
    expect(featured[0].matchedBy).toBe('reference');
  });

  it('ignores a tag that maps to no category', () => {
    const featured = select({
      category: 'buying-basics',
      tags: ['unmapped-tag'],
      products: CATALOG,
    });

    expect(featured).toEqual([]);
  });

  it('selects a lighting product for a buying-basics guide tagged eye-strain', () => {
    const featured = select({
      title: 'Reducing eye strain at a desk: distance and lighting breaks',
      tags: ['eye-strain', 'monitor-setup', 'desk-ergonomics', 'buying-basics'],
      category: 'buying-basics',
      products: [DESK_MAT, MONITOR_ARM, MONITOR_LIGHT],
    });

    expect(featured.map((entry) => entry.slug)).toContain('quntis-monitor-light');
  });
});
