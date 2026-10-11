import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import {
  consumeRateLimit,
  decideRateLimit,
  enforceRateLimit,
  type RateLimitRule,
  windowStartFor,
} from './rate-limit';

const NOW = Date.parse('2026-10-12T12:34:56.789Z');
const WINDOW_MS = 60_000;
const WINDOW_START = '2026-10-12T12:34:00.000Z';
const PREVIOUS_WINDOW_START = '2026-10-12T12:33:00.000Z';

const READ_RULE: RateLimitRule = {
  key: 'admin:read:admin@example.com',
  limit: 240,
  windowMs: WINDOW_MS,
};

interface FakeRow {
  window_start: string;
  window_count: number;
}

interface FakeWrite {
  sql: string;
  params: unknown[];
}

function createFakeDatabase(row: FakeRow | null): {
  database: D1Database;
  writes: FakeWrite[];
} {
  const writes: FakeWrite[] = [];

  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async first() {
          writes.push({ sql, params });
          return row;
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, writes };
}

describe('windowStartFor', () => {
  it('floors the moment to the start of its window', () => {
    expect(windowStartFor(NOW, WINDOW_MS)).toBe(WINDOW_START);
  });

  it('keeps a moment exactly on the boundary in the new window', () => {
    expect(windowStartFor(Date.parse(WINDOW_START), WINDOW_MS)).toBe(WINDOW_START);
  });

  it('keeps a moment one millisecond before the boundary in the previous window', () => {
    expect(windowStartFor(Date.parse(WINDOW_START) - 1, WINDOW_MS)).toBe(PREVIOUS_WINDOW_START);
  });

  it('honours longer windows', () => {
    expect(windowStartFor(NOW, 5 * 60_000)).toBe('2026-10-12T12:30:00.000Z');
  });
});

describe('decideRateLimit', () => {
  it('allows the first request of a window and reports the remaining budget', () => {
    expect(decideRateLimit(WINDOW_START, 1, READ_RULE, NOW)).toEqual({
      allowed: true,
      remaining: 239,
      retryAfterSeconds: 0,
    });
  });

  it('allows the request that lands exactly on the limit', () => {
    expect(decideRateLimit(WINDOW_START, 240, READ_RULE, NOW)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    });
  });

  it('rejects the request one over the limit with the time left in the window', () => {
    expect(decideRateLimit(WINDOW_START, 241, READ_RULE, NOW)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 4,
    });
  });

  it('reports the full window as the wait at the start of the window', () => {
    expect(decideRateLimit(WINDOW_START, 241, READ_RULE, Date.parse(WINDOW_START))).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });

  it('treats a count from a stale window as the first request of the current one', () => {
    expect(decideRateLimit(PREVIOUS_WINDOW_START, 500, READ_RULE, NOW)).toEqual({
      allowed: true,
      remaining: 239,
      retryAfterSeconds: 0,
    });
  });
});

describe('consumeRateLimit', () => {
  it('increments atomically and decides from the returned row', async () => {
    const { database, writes } = createFakeDatabase({
      window_start: WINDOW_START,
      window_count: 5,
    });

    const decision = await consumeRateLimit(database, READ_RULE, NOW);

    expect(decision).toEqual({ allowed: true, remaining: 235, retryAfterSeconds: 0 });
    expect(writes[0].sql).toContain('ON CONFLICT(key) DO UPDATE');
    expect(writes[0].sql).toContain('RETURNING window_count, window_start');
    expect(writes[0].params).toEqual([READ_RULE.key, WINDOW_START]);
  });

  it('resets the count when the stored window is stale', async () => {
    const { database } = createFakeDatabase({
      window_start: PREVIOUS_WINDOW_START,
      window_count: 500,
    });

    const decision = await consumeRateLimit(database, READ_RULE, NOW);

    expect(decision).toEqual({ allowed: true, remaining: 239, retryAfterSeconds: 0 });
  });

  it('allows the request when the counter row cannot be read', async () => {
    const { database } = createFakeDatabase(null);

    const decision = await consumeRateLimit(database, READ_RULE, NOW);

    expect(decision).toEqual({ allowed: true, remaining: 239, retryAfterSeconds: 0 });
  });
});

describe('enforceRateLimit', () => {
  it('resolves while the bucket has budget', async () => {
    const { database } = createFakeDatabase({
      window_start: WINDOW_START,
      window_count: 240,
    });

    await expect(enforceRateLimit(database, READ_RULE, NOW)).resolves.toBeUndefined();
  });

  it('throws a rate limit error when the bucket is exhausted', async () => {
    const { database } = createFakeDatabase({
      window_start: WINDOW_START,
      window_count: 241,
    });

    const failure = await enforceRateLimit(database, READ_RULE, NOW).catch((error) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again shortly.',
    });
  });
});
