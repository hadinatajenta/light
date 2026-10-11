import { describe, expect, it } from 'vitest';
import { extractHtmlTitle, htmlToText } from './html-text';

describe('htmlToText', () => {
  it('drops script, style, and head content', () => {
    const html =
      '<html><head><style>body{color:red}</style><title>T</title></head><body><script>alert(1)</script><p>Hello world</p></body></html>';
    const text = htmlToText(html);

    expect(text).toContain('Hello world');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToText('<p>Ben &amp; Jerry&#39;s &#x2014; open</p>')).toBe("Ben & Jerry's — open");
  });

  it('separates block elements with newlines', () => {
    expect(htmlToText('<p>One</p><p>Two</p>').split('\n')).toEqual(['One', 'Two']);
  });

  it('turns list items into bullet lines', () => {
    const text = htmlToText('<ul><li>Alpha</li><li>Beta</li></ul>');
    expect(text).toContain('- Alpha');
    expect(text).toContain('- Beta');
  });

  it('collapses runs of blank lines', () => {
    expect(htmlToText('<p>A</p>\n\n\n\n<p>B</p>')).toBe('A\n\nB');
  });
});

describe('extractHtmlTitle', () => {
  it('reads and trims the title element', () => {
    expect(extractHtmlTitle('<title>  Office   Chairs </title>')).toBe('Office Chairs');
  });

  it('falls back to og:title', () => {
    expect(extractHtmlTitle('<meta property="og:title" content="Standing Desks">')).toBe(
      'Standing Desks',
    );
  });

  it('returns an empty string when there is no title', () => {
    expect(extractHtmlTitle('<p>hello</p>')).toBe('');
  });
});
