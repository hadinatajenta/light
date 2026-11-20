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

describe('renderMarkdown tables', () => {
  const comparisonTable = [
    '| Model | Price |',
    '| --- | --- |',
    '| M6 | $1,999 |',
    '',
    'Between the tables.',
    '',
    '| Port | Count |',
    '| --- | --- |',
    '| HDMI | 1 |',
  ].join('\n');

  it('places every markdown table inside a focusable, labelled scroll region', () => {
    const { html } = renderMarkdown(comparisonTable);
    const scrollRegions = html.match(
      /<div class="post-table-scroll" tabindex="0" role="region" aria-label="Scrollable table">\n<table>[\s\S]*?<\/table>\n<\/div>/g,
    );

    expect(scrollRegions).toHaveLength(2);
    expect(html.match(/<table>/g)).toHaveLength(2);
  });

  it('keeps prose between tables outside the scroll regions', () => {
    const { html } = renderMarkdown(comparisonTable);
    const firstRegionEnd = html.indexOf('</div>');
    const secondRegionStart = html.lastIndexOf('<div class="post-table-scroll"');
    const proseIndex = html.indexOf('<p>Between the tables.</p>');

    expect(proseIndex).toBeGreaterThan(firstRegionEnd);
    expect(proseIndex).toBeLessThan(secondRegionStart);
  });
});
