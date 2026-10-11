import { describe, expect, it } from 'vitest';
import { dedupeByUrlKey, normalizeUrlKey, resolveSourceUrl, verifyQuote } from './citations';

const SOURCE =
  'ANSI/BIFMA X5.1 requires that the seat height adjust from 16 to 21 inches for the general office population.';

describe('verifyQuote', () => {
  it('accepts an exact span', () => {
    expect(verifyQuote('seat height adjust from 16 to 21 inches', SOURCE)).toBe(true);
  });

  it('accepts a span with different case and punctuation', () => {
    expect(verifyQuote('Seat height, adjust from 16 to 21 inches!', SOURCE)).toBe(true);
  });

  it('rejects a quote that is too short to check', () => {
    expect(verifyQuote('seat height', SOURCE)).toBe(false);
  });

  it('rejects a quote that the source does not support', () => {
    expect(
      verifyQuote('the warranty covers fifty years of continuous daily commercial use', SOURCE),
    ).toBe(false);
  });
});

describe('normalizeUrlKey', () => {
  it('strips fragments, tracking parameters, and trailing slashes', () => {
    expect(normalizeUrlKey('https://Example.com/a/?utm_source=news#section')).toBe(
      'https://example.com/a',
    );
  });

  it('treats a trailing slash as equal to no slash', () => {
    expect(normalizeUrlKey('https://example.com/a/')).toBe(
      normalizeUrlKey('https://example.com/a'),
    );
  });
});

describe('resolveSourceUrl', () => {
  it('resolves a tracking variant back to the harvested url', () => {
    const allowed = new Map([[normalizeUrlKey('https://example.com/a'), 'https://example.com/a']]);
    expect(resolveSourceUrl('https://example.com/a?utm_medium=email', allowed)).toBe(
      'https://example.com/a',
    );
  });

  it('rejects a url that was never harvested', () => {
    const allowed = new Map([[normalizeUrlKey('https://example.com/a'), 'https://example.com/a']]);
    expect(resolveSourceUrl('https://attacker.example/x', allowed)).toBeNull();
  });
});

describe('dedupeByUrlKey', () => {
  it('keeps the first entry per normalized url', () => {
    const deduped = dedupeByUrlKey([
      { url: 'https://a.com/', title: 'first' },
      { url: 'https://a.com', title: 'second' },
      { url: 'https://b.com', title: 'third' },
    ]);

    expect(deduped.map((entry) => entry.title)).toEqual(['first', 'third']);
  });
});
