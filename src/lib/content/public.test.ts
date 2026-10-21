import { describe, expect, it, vi } from 'vitest';

vi.mock('./store', () => ({
  getPost: async () => null,
  listPosts: async () => [],
}));

import { renderMarkdown } from './public';

describe('renderMarkdown affiliate links', () => {
  it('renders a product reference as plain text with no anchor when no links are available', () => {
    const result = renderMarkdown('See [the Aeron chair](product:aeron) for details.', new Map());

    expect(result.affiliateLinks).toBe(0);
    expect(result.unresolvedProductSlugs).toEqual(['aeron']);
    expect(result.html).not.toContain('<a');
    expect(result.html).not.toContain('product:');
    expect(result.html).toContain('the Aeron chair');
  });

  it('renders a product reference as a redirect link when the product is available', () => {
    const result = renderMarkdown(
      'See [the Aeron chair](product:aeron) for details.',
      new Map([['aeron', 'https://www.amazon.com/dp/B08XYZ1234?tag=lightscripts-20']]),
    );

    expect(result.affiliateLinks).toBe(1);
    expect(result.html).toContain('href="/go/aeron?p=body"');
    expect(result.html).toContain('rel="sponsored nofollow noopener"');
  });
});
