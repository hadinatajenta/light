import { describe, expect, it } from 'vitest';
import {
  escapeNotificationHtml,
  formatNotificationHtml,
  formatNotificationSubject,
  formatNotificationText,
  formatNotificationTimestamp,
  NOTIFICATION_BODY_MAX_LENGTH,
  NOTIFICATION_TELEGRAM_MAX_LENGTH,
  type NotificationMessageSource,
  sanitizeNotificationText,
} from './format';

const SOURCE: NotificationMessageSource = {
  level: 'error',
  category: 'agent',
  title: 'Agent "Desk Writer" run failed',
  body: 'The DeepSeek account has no balance.',
  link: 'https://admin.example.com/dashboard/activity',
  createdAt: '2026-10-12T09:30:00.000Z',
};

describe('sanitizeNotificationText', () => {
  it('strips control characters that would corrupt a message', () => {
    expect(sanitizeNotificationText('Run\u0007 failed\u0000 here', 200)).toBe('Run failed here');
  });

  it('strips zero-width and bidirectional overrides', () => {
    expect(sanitizeNotificationText('A\u200bB\u202eC\ufeffD', 200)).toBe('ABCD');
  });

  it('normalizes line endings and collapses blank runs', () => {
    expect(sanitizeNotificationText('one\r\n\r\ntwo\r\n\r\n\r\nthree', 200)).toBe(
      'one\n\ntwo\n\nthree',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeNotificationText('   spaced   ', 200)).toBe('spaced');
  });

  it('bounds the length and marks the cut', () => {
    const sanitized = sanitizeNotificationText('x'.repeat(500), 100);

    expect(sanitized).toHaveLength(100);
    expect(sanitized.endsWith('…')).toBe(true);
  });

  it('keeps text that already fits untouched', () => {
    expect(sanitizeNotificationText('short', 100)).toBe('short');
  });
});

describe('escapeNotificationHtml', () => {
  it('neutralizes markup that arrives from model output', () => {
    expect(escapeNotificationHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersands and single quotes', () => {
    expect(escapeNotificationHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#39;s');
  });
});

describe('formatNotificationSubject', () => {
  it('prefixes the level so mailbox filters can match', () => {
    expect(formatNotificationSubject(SOURCE)).toBe('[Light] Error: Agent "Desk Writer" run failed');
  });

  it('bounds the subject length', () => {
    const subject = formatNotificationSubject({ ...SOURCE, title: 'y'.repeat(400) });

    expect(subject.length).toBeLessThanOrEqual(160);
  });
});

describe('formatNotificationText', () => {
  it('includes the title, body, category, time, and link', () => {
    const text = formatNotificationText(SOURCE);

    expect(text).toContain('Agent "Desk Writer" run failed');
    expect(text).toContain('The DeepSeek account has no balance.');
    expect(text).toContain('Category: agent');
    expect(text).toContain('Time: 2026-10-12 09:30 UTC');
    expect(text).toContain('Open: https://admin.example.com/dashboard/activity');
  });

  it('omits the link line when there is no link', () => {
    expect(formatNotificationText({ ...SOURCE, link: null })).not.toContain('Open:');
  });

  it('stays inside the Telegram message limit', () => {
    const text = formatNotificationText({
      ...SOURCE,
      body: 'z'.repeat(NOTIFICATION_BODY_MAX_LENGTH * 2),
    });

    expect(text.length).toBeLessThanOrEqual(NOTIFICATION_TELEGRAM_MAX_LENGTH);
  });
});

describe('formatNotificationHtml', () => {
  it('escapes the body instead of rendering it', () => {
    const html = formatNotificationHtml({ ...SOURCE, body: '<img src=x onerror=alert(1)>' });

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('keeps paragraphs separated', () => {
    expect(formatNotificationHtml(SOURCE).split('<p').length).toBeGreaterThan(2);
  });
});

describe('formatNotificationTimestamp', () => {
  it('renders an invalid date unchanged', () => {
    expect(formatNotificationTimestamp('not-a-date')).toBe('not-a-date');
  });
});
