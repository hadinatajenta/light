import { marked } from 'marked';
import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from './public';
import { sanitizeMarkdownTokens } from './sanitize-markdown';

vi.mock('./store', () => ({
  getPost: vi.fn(),
  listPosts: vi.fn(),
}));

function renderTokens(body: string): string {
  const tokens = marked.lexer(body);
  sanitizeMarkdownTokens(tokens);

  return marked.parser(tokens, { async: false });
}

function renderBody(body: string, affiliateLinks: Map<string, string> = new Map()): string {
  return renderMarkdown(body, affiliateLinks).html;
}

describe('sanitizeMarkdownTokens', () => {
  it('replaces a block html token with a paragraph token holding escaped markup', () => {
    const tokens = marked.lexer('<script>alert(1)</script>');

    sanitizeMarkdownTokens(tokens);

    expect(tokens.map((token) => token.type)).toEqual(['paragraph']);
    expect(tokens[0]).toMatchObject({ text: '&lt;script&gt;alert(1)&lt;/script&gt;' });
  });

  it('keeps product destinations intact for affiliate resolution', () => {
    expect(renderTokens('[buy](product:some-slug)')).toBe(
      '<p><a href="product:some-slug">buy</a></p>\n',
    );
  });
});

describe('renderMarkdown html neutralization', () => {
  it('escapes a block script element so it renders as text', () => {
    const html = renderBody('<script>alert(1)</script>');

    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n');
    expect(html).not.toContain('<script');
  });

  it('escapes an inline event handler element inside a paragraph', () => {
    const html = renderBody('before <img src=x onerror=alert(1)> after');

    expect(html).toBe('<p>before &lt;img src=x onerror=alert(1)&gt; after</p>\n');
    expect(html).not.toContain('<img');
  });

  it('escapes inline html tokens inside headings', () => {
    const html = renderBody('## Title <b>x</b>');

    expect(html).toContain('Title &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('escapes inline html tokens inside table cells and list items', () => {
    const body = [
      '| a | b |',
      '| --- | --- |',
      '| <img src=x onerror=alert(1)> | [c](javascript:alert(1)) |',
      '',
      '- item <b>x</b>',
      '- [d](/safe)',
    ].join('\n');
    const html = renderBody(body);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('<a href="/safe">d</a>');
    expect(html).toContain('post-table-scroll');
  });
});

describe('renderMarkdown link neutralization', () => {
  it('renders the label of an unsafe link as plain text', () => {
    const unsafeDestinations = [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ];

    for (const destination of unsafeDestinations) {
      expect(renderBody(`[click](${destination})`), destination).toBe('<p>click</p>\n');
    }
  });

  it('neutralizes obfuscated javascript destinations', () => {
    const destinations = [
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)  ',
      '&#106;avascript:alert(1)',
      'java&Tab;script:alert(1)',
      'java&NewLine;script:alert(1)',
      'javascript&colon;alert(1)',
    ];

    for (const destination of destinations) {
      expect(renderBody(`[click](${destination})`), destination).toBe('<p>click</p>\n');
    }
  });

  it('neutralizes destinations reached through definitions and autolinks', () => {
    expect(renderBody('[x]: javascript:alert(1)\n\n[x][x]')).toBe('<p>x</p>\n');
    expect(renderBody('<javascript:alert(1)>')).toBe('<p>javascript:alert(1)</p>\n');
  });

  it('replaces an unsafe image with its alt text', () => {
    expect(renderBody('![alt text](javascript:alert(1))')).toBe('<p>alt text</p>\n');
    expect(renderBody('![alt](data:text/html;base64,PHNjcmlwdD4=)')).toBe('<p>alt</p>\n');
  });

  it('keeps safe destinations as anchors', () => {
    expect(renderBody('[ok](https://example.com)')).toBe(
      '<p><a href="https://example.com">ok</a></p>\n',
    );
    expect(renderBody('[mail](mailto:hello@example.com)')).toBe(
      '<p><a href="mailto:hello@example.com">mail</a></p>\n',
    );
    expect(renderBody('[anchor](#section)')).toBe('<p><a href="#section">anchor</a></p>\n');
    expect(renderBody('[path](/blog/light)')).toBe('<p><a href="/blog/light">path</a></p>\n');
  });

  it('resolves product links through the affiliate map', () => {
    const result = renderMarkdown(
      '[buy](product:some-slug)',
      new Map([['some-slug', 'https://aff.example/track']]),
    );

    expect(result.affiliateLinks).toBe(1);
    expect(result.html).toContain('href="/go/some-slug"');
    expect(result.html).toContain('rel="sponsored nofollow noopener"');
  });
});

describe('renderMarkdown structure', () => {
  it('still renders headings, tables, and lists', () => {
    const body = '## Heading\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two\n';
    const html = renderBody(body);

    expect(html).toContain('<h2 id="heading">Heading</h2>');
    expect(html).toContain('<table>');
    expect(html).toContain('post-table-scroll');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('still renders inline emphasis and code', () => {
    const html = renderBody('a **bold** and `code` value');

    expect(html).toBe('<p>a <strong>bold</strong> and <code>code</code> value</p>\n');
  });
});
