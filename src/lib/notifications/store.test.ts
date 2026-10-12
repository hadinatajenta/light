import { describe, expect, it } from 'vitest';
import {
  clampNotificationLimit,
  decodeNotificationCursor,
  encodeNotificationCursor,
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_MAX_LIMIT,
} from './store';

describe('clampNotificationLimit', () => {
  it('falls back to the default for a missing or non-finite value', () => {
    expect(clampNotificationLimit(Number.NaN)).toBe(NOTIFICATION_DEFAULT_LIMIT);
    expect(clampNotificationLimit(Number.POSITIVE_INFINITY)).toBe(NOTIFICATION_DEFAULT_LIMIT);
  });

  it('refuses a page larger than the cap', () => {
    expect(clampNotificationLimit(100_000)).toBe(NOTIFICATION_MAX_LIMIT);
  });

  it('refuses a page smaller than one', () => {
    expect(clampNotificationLimit(0)).toBe(1);
    expect(clampNotificationLimit(-5)).toBe(1);
  });

  it('keeps a reasonable page size', () => {
    expect(clampNotificationLimit(25)).toBe(25);
  });
});

describe('notification cursors', () => {
  it('round trips a record position', () => {
    const cursor = encodeNotificationCursor({
      createdAt: '2026-10-12T09:30:00.000Z',
      id: 'notif-1',
    });

    expect(decodeNotificationCursor(cursor)).toEqual({
      createdAt: '2026-10-12T09:30:00.000Z',
      id: 'notif-1',
    });
  });

  it('keeps an id that itself contains a separator', () => {
    const cursor = encodeNotificationCursor({ createdAt: '2026-10-12T09:30:00.000Z', id: 'a|b' });

    expect(decodeNotificationCursor(cursor)?.id).toBe('a|b');
  });

  it('rejects a cursor that carries no position', () => {
    expect(decodeNotificationCursor('')).toBeNull();
    expect(decodeNotificationCursor('|')).toBeNull();
    expect(decodeNotificationCursor('2026-10-12T09:30:00.000Z|')).toBeNull();
  });
});
