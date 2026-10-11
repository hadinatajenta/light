import { describe, expect, it } from 'vitest';
import { wrapMarkdownTables } from './markdown';

describe('wrapMarkdownTables', () => {
  it('wraps a table in a focusable scroll container', () => {
    const html = wrapMarkdownTables('<table><thead><tr><th>A</th></tr></thead></table>');

    expect(html).toContain('<div class="post-table-scroll" tabindex="0">');
    expect(html).toContain('<table><thead><tr><th>A</th></tr></thead></table>');
    expect(html).toContain('</div>');
  });

  it('wraps every table in the document', () => {
    const html = wrapMarkdownTables(
      '<table><tbody><tr><td>1</td></tr></tbody></table><p>x</p><table><tbody><tr><td>2</td></tr></tbody></table>',
    );

    expect(html.match(/post-table-scroll/g)).toHaveLength(2);
  });

  it('leaves html without a table untouched', () => {
    const html = '<p>No tables here.</p>';

    expect(wrapMarkdownTables(html)).toBe(html);
  });

  it('keeps content that follows a table outside the wrapper', () => {
    const html = wrapMarkdownTables(
      '<table><tbody><tr><td>1</td></tr></tbody></table><p>after</p>',
    );
    const openIndex = html.indexOf('<div class="post-table-scroll"');
    const closeIndex = html.indexOf('</div>', openIndex);

    expect(html.indexOf('<p>after</p>')).toBeGreaterThan(closeIndex);
  });

  it('does not merge two adjacent tables into one wrapper', () => {
    const html = wrapMarkdownTables(
      '<table><tbody><tr><td>1</td></tr></tbody></table><table><tbody><tr><td>2</td></tr></tbody></table>',
    );

    expect(html).toContain('</table>\n</div><div class="post-table-scroll"');
  });
});
