import { describe, expect, it } from 'vitest';
import {
  buildBaseUrl,
  buildShareUrl,
  deriveShareBlurb,
  escapeTelegramHtml,
  firstSentence,
  renderShareMessage,
  toAbsoluteUrl,
} from './templates';
import type { ShareChannel, SharePostContent } from './types';

const ORIGIN = 'https://lightscripts.com';

function channel(): ShareChannel {
  return {
    id: 'telegram-main',
    provider: 'telegram',
    label: 'Telegram',
    enabled: true,
    config: { chatId: '-100123' },
    secretKeys: ['botToken'],
    dailyCap: null,
    requireApproval: false,
    needsAttention: false,
    pausedUntil: null,
    startedAt: null,
    lastError: null,
    lastSuccessAt: null,
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  };
}

function post(overrides: Partial<SharePostContent> = {}): SharePostContent {
  return {
    id: 'best-office-chairs',
    title: 'Best Office Chairs',
    description: 'A practical guide to office chairs.',
    body: 'A practical guide to office chairs.',
    coverUrl: null,
    affiliate: false,
    ...overrides,
  };
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

describe('escapeTelegramHtml', () => {
  it('escapes ampersands, angle brackets, and only once', () => {
    expect(escapeTelegramHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(escapeTelegramHtml('<b>')).toBe('&lt;b&gt;');
  });
});

describe('firstSentence', () => {
  it('returns the first sentence', () => {
    expect(firstSentence('First sentence. Second one.')).toBe('First sentence.');
  });

  it('returns the whole text when there is no terminator', () => {
    expect(firstSentence('Just a fragment')).toBe('Just a fragment');
  });

  it('collapses whitespace', () => {
    expect(firstSentence('  spaced\n\nout.  more ')).toBe('spaced out.');
  });
});

describe('deriveShareBlurb', () => {
  it('prefers the description', () => {
    expect(deriveShareBlurb(post({ description: 'Explicit blurb' }))).toBe('Explicit blurb');
  });

  it('falls back to the first sentence of the body when the description is empty', () => {
    expect(deriveShareBlurb(post({ description: '   ', body: 'From the body. Extra.' }))).toBe(
      'From the body.',
    );
  });

  it('truncates a very long fallback to the cap', () => {
    const body = `${'x'.repeat(300)}. tail`;
    expect(codePointLength(deriveShareBlurb(post({ description: '', body })))).toBe(140);
  });
});

describe('toAbsoluteUrl', () => {
  it('returns null for empty input', () => {
    expect(toAbsoluteUrl(ORIGIN, null)).toBeNull();
    expect(toAbsoluteUrl(ORIGIN, '  ')).toBeNull();
  });

  it('keeps absolute urls', () => {
    expect(toAbsoluteUrl(ORIGIN, 'https://cdn.example.com/a.jpg')).toBe(
      'https://cdn.example.com/a.jpg',
    );
  });

  it('joins relative urls onto the origin', () => {
    expect(toAbsoluteUrl(ORIGIN, '/media/a.jpg')).toBe('https://lightscripts.com/media/a.jpg');
    expect(toAbsoluteUrl(ORIGIN, 'media/a.jpg')).toBe('https://lightscripts.com/media/a.jpg');
  });
});

describe('buildBaseUrl', () => {
  it('builds the base article url without UTM', () => {
    const url = buildBaseUrl(post(), ORIGIN);
    expect(url).toBe('https://lightscripts.com/blog/best-office-chairs');
    expect(url).not.toContain('utm');
    expect(url).not.toContain('?');
  });
});

describe('buildShareUrl', () => {
  it('adds the UTM parameters', () => {
    const url = new URL(buildShareUrl(post(), channel(), ORIGIN));
    expect(url.searchParams.get('utm_source')).toBe('telegram');
    expect(url.searchParams.get('utm_medium')).toBe('social');
    expect(url.searchParams.get('utm_campaign')).toBe('autoshare');
    expect(url.pathname).toBe('/blog/best-office-chairs');
  });
});

describe('renderShareMessage', () => {
  it('renders a text message without a cover', () => {
    const message = renderShareMessage(channel(), post(), ORIGIN);
    expect(message.photoUrl).toBeNull();
    expect(message.text).toContain('<b>Best Office Chairs</b>');
    expect(message.text).toContain('https://lightscripts.com/blog/best-office-chairs');
    expect(message.text).toContain('utm_campaign=autoshare');
  });

  it('uses an absolute cover url and a photo caption', () => {
    const message = renderShareMessage(channel(), post({ coverUrl: '/media/cover.jpg' }), ORIGIN);
    expect(message.photoUrl).toBe('https://lightscripts.com/media/cover.jpg');
  });

  it('never truncates the url even with a very long description', () => {
    const message = renderShareMessage(
      channel(),
      post({ description: 'x'.repeat(5000), coverUrl: '/media/cover.jpg' }),
      ORIGIN,
    );
    expect(codePointLength(message.text)).toBeLessThanOrEqual(1024);
    expect(message.text).toContain('https://lightscripts.com/blog/best-office-chairs');
    expect(message.text).toContain('utm_campaign=autoshare');
  });

  it('escapes the title and description', () => {
    const message = renderShareMessage(
      channel(),
      post({ title: '<b>&</b>', description: 'a < b' }),
      ORIGIN,
    );
    expect(message.text).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
    expect(message.text).toContain('a &lt; b');
  });

  it('adds an affiliate disclosure when the post is affiliate', () => {
    const message = renderShareMessage(channel(), post({ affiliate: true }), ORIGIN);
    expect(message.text.toLowerCase()).toContain('affiliate');
  });
});
