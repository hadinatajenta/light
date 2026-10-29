import { describe, expect, it, vi } from 'vitest';

vi.mock('./store', () => ({
  getPost: async () => null,
  listPosts: async () => [],
}));

import { renderMarkdown } from './public';

describe('renderMarkdown product references', () => {
  it('renders a legacy product reference as plain text with no anchor', () => {
    const { html } = renderMarkdown('See [the Aeron chair](product:aeron) for details.');

    expect(html).not.toContain('<a');
    expect(html).not.toContain('product:');
    expect(html).toContain('the Aeron chair');
  });

  it('keeps ordinary links untouched', () => {
    const { html } = renderMarkdown('Read [the spec](https://example.com/spec) first.');

    expect(html).toContain('<a href="https://example.com/spec"');
  });
});
