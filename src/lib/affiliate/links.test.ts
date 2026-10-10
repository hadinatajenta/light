import { describe, expect, it } from 'vitest';
import type { AffiliateProgram } from '@/config/monetization';
import { buildAffiliateUrl, resolveAffiliateLinks } from './links';

const AMAZON: AffiliateProgram = {
  id: 'amazon',
  name: 'Amazon Associates',
  network: 'amazon',
  trackingId: 'lightscripts-20',
  linkTemplate: 'https://www.amazon.com/dp/{target}?tag={trackingId}',
  status: 'approved',
  disclosure: 'As an Amazon Associate I earn from qualifying purchases.',
};

describe('buildAffiliateUrl', () => {
  it('fills the template with the target and the tracking id', () => {
    expect(buildAffiliateUrl(AMAZON, 'B08XYZ1234')).toBe(
      'https://www.amazon.com/dp/B08XYZ1234?tag=lightscripts-20',
    );
  });

  it('refuses a program that is not approved', () => {
    expect(buildAffiliateUrl({ ...AMAZON, status: 'paused' }, 'B08XYZ1234')).toBeNull();
    expect(buildAffiliateUrl({ ...AMAZON, status: 'pending' }, 'B08XYZ1234')).toBeNull();
  });

  it('refuses a program without a tracking id or template', () => {
    expect(buildAffiliateUrl({ ...AMAZON, trackingId: null }, 'B08XYZ1234')).toBeNull();
    expect(buildAffiliateUrl({ ...AMAZON, linkTemplate: null }, 'B08XYZ1234')).toBeNull();
  });

  it('refuses a target that could break out of the href', () => {
    expect(buildAffiliateUrl(AMAZON, 'B08"><script>')).toBeNull();
    expect(buildAffiliateUrl(AMAZON, 'has space')).toBeNull();
  });
});

describe('resolveAffiliateLinks', () => {
  const links = new Map([['aeron', 'https://www.amazon.com/dp/B08XYZ1234?tag=lightscripts-20']]);

  it('rewrites a product link and marks it sponsored', () => {
    const result = resolveAffiliateLinks('<p><a href="product:aeron">the Aeron</a></p>', links);

    expect(result.affiliateLinks).toBe(1);
    expect(result.unresolvedSlugs).toEqual([]);
    expect(result.html).toContain(
      'href="https://www.amazon.com/dp/B08XYZ1234?tag=lightscripts-20"',
    );
    expect(result.html).toContain('rel="sponsored nofollow noopener"');
    expect(result.html).toContain('target="_blank"');
    expect(result.html).toContain('>the Aeron</a>');
  });

  it('drops an unknown product link but keeps its text', () => {
    const result = resolveAffiliateLinks(
      '<p><a href="product:missing">some product</a></p>',
      links,
    );

    expect(result.affiliateLinks).toBe(0);
    expect(result.unresolvedSlugs).toEqual(['missing']);
    expect(result.html).toBe('<p>some product</p>');
  });

  it('leaves ordinary links untouched', () => {
    const html = '<p><a href="https://example.com">external</a></p>';
    const result = resolveAffiliateLinks(html, links);

    expect(result.html).toBe(html);
    expect(result.affiliateLinks).toBe(0);
  });

  it('counts each affiliate link in a post', () => {
    const html = '<a href="product:aeron">one</a> and <a href="product:aeron">two</a>';
    expect(resolveAffiliateLinks(html, links).affiliateLinks).toBe(2);
  });
});
