import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    AGENT_SECRET_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  } as Record<string, string | undefined>,
}));

vi.mock('cloudflare:workers', () => ({ env: state.env }));

import { encryptSecret } from '../agents/secrets';
import {
  backoffMsForFailures,
  clampRetryAfterMs,
  type RunShareSenderOptions,
  redactShareError,
  resolveOutcomePlan,
  runShareSender,
} from './sender';

const NOW = new Date('2026-10-11T12:00:00.000Z');
const ORIGIN = 'https://lightscripts.com';

interface Write {
  sql: string;
  params: unknown[];
}

interface FakeOptions {
  claimed: Record<string, unknown>[];
  configJson: string;
  post?: Record<string, unknown> | null;
  outboxChanges?: number;
}

function createFakeDatabase(options: FakeOptions): { database: D1Database; log: Write[] } {
  const log: Write[] = [];
  const post = options.post ?? {
    id: 'post-1',
    title: 'A Post',
    description: 'A description',
    body: 'Body',
    cover_url: null,
    affiliate: 0,
    status: 'published',
  };

  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async all() {
          log.push({ sql, params });
          if (sql.includes('ROW_NUMBER() OVER')) {
            return { results: options.claimed };
          }
          return { results: [] };
        },
        async first() {
          log.push({ sql, params });
          if (sql.includes('SELECT config FROM share_channels')) {
            return { config: options.configJson };
          }
          if (sql.includes('FROM share_channels')) {
            return {
              id: 'chan-1',
              provider: 'telegram',
              label: 'Telegram',
              enabled: 1,
              config: options.configJson,
              daily_cap: null,
              require_approval: 0,
              needs_attention: 0,
              paused_until: null,
              started_at: null,
              last_error: null,
              last_success_at: null,
              created_at: '2026-10-01T00:00:00.000Z',
              updated_at: '2026-10-01T00:00:00.000Z',
            };
          }
          if (sql.includes('FROM posts')) {
            return post;
          }
          return null;
        },
        async run() {
          log.push({ sql, params });
          const changes = sql.includes('UPDATE share_outbox') ? (options.outboxChanges ?? 1) : 1;
          return { meta: { changes } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, log };
}

function claimedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    post_id: 'post-1',
    channel_id: 'chan-1',
    status: 'sending',
    attempts: 1,
    failures: 0,
    rate_limit_hits: 0,
    next_attempt_at: NOW.toISOString(),
    age_reset_at: null,
    locked_at: NOW.toISOString(),
    provider_post_id: null,
    shared_url: null,
    error: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

async function configJson(): Promise<string> {
  const encrypted = await encryptSecret('123:abc');
  return JSON.stringify({ public: { chatId: '-100' }, secret: { botToken: encrypted } });
}

function options(
  fetchImpl: typeof fetch,
  overrides: Partial<RunShareSenderOptions> = {},
): RunShareSenderOptions {
  return {
    now: NOW,
    origin: ORIGIN,
    budgetMs: 60_000,
    maxJobs: 5,
    perChannelLimit: 2,
    jobDeadlineMs: 25_000,
    fetchImpl,
    sleep: async () => {},
    jitterMs: { min: 0, max: 0 },
    clock: () => NOW.getTime(),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('backoffMsForFailures', () => {
  it('follows the 1m, 5m, 30m, 2h ladder and fails at five', () => {
    expect(backoffMsForFailures(1)).toBe(60_000);
    expect(backoffMsForFailures(2)).toBe(300_000);
    expect(backoffMsForFailures(3)).toBe(1_800_000);
    expect(backoffMsForFailures(4)).toBe(7_200_000);
    expect(backoffMsForFailures(5)).toBeNull();
    expect(backoffMsForFailures(0)).toBe(60_000);
  });
});

describe('clampRetryAfterMs', () => {
  it('defaults and caps retry-after', () => {
    expect(clampRetryAfterMs(undefined)).toBe(60_000);
    expect(clampRetryAfterMs(120_000)).toBe(120_000);
    expect(clampRetryAfterMs(9_000_000)).toBe(3_600_000);
  });
});

describe('resolveOutcomePlan', () => {
  it('maps each adapter outcome', () => {
    expect(resolveOutcomePlan({ outcome: 'success', providerPostId: '1' }).action).toBe('sent');
    expect(resolveOutcomePlan({ outcome: 'channel_config' }).action).toBe('channel_config');
    expect(resolveOutcomePlan({ outcome: 'invalid_payload' }).action).toBe('failed');
    expect(resolveOutcomePlan({ outcome: 'rate_limited' }).action).toBe('rate_limited');
    expect(resolveOutcomePlan({ outcome: 'transient' }).action).toBe('transient');
  });
});

describe('redactShareError', () => {
  it('removes stored secrets and telegram bot tokens', () => {
    const redacted = redactShareError('failed with bot123456:ABCdef and sk-secret-token', [
      'sk-secret-token',
    ]);
    expect(redacted).not.toContain('sk-secret-token');
    expect(redacted).not.toContain('ABCdef');
  });
});

describe('runShareSender', () => {
  it('marks a successful send and records usage', async () => {
    const { database, log } = createFakeDatabase({
      claimed: [claimedRow()],
      configJson: await configJson(),
    });
    const fetchImpl = (async () =>
      jsonResponse({ ok: true, result: { message_id: 5 } })) as unknown as typeof fetch;

    const result = await runShareSender(database, options(fetchImpl));

    expect(result).toMatchObject({ processed: 1, sent: 1, failed: 0, remaining: 0 });
    expect(log.some((write) => write.sql.includes('INSERT INTO usage_counters'))).toBe(true);
    const sentWrite = log.find(
      (write) => write.sql.includes('UPDATE share_outbox') && write.sql.includes("status = 'sent'"),
    );
    expect(sentWrite).toBeTruthy();
  });

  it('warns but still counts a duplicate sent write', async () => {
    const { database } = createFakeDatabase({
      claimed: [claimedRow()],
      configJson: await configJson(),
      outboxChanges: 0,
    });
    const fetchImpl = (async () =>
      jsonResponse({ ok: true, result: { message_id: 5 } })) as unknown as typeof fetch;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runShareSender(database, options(fetchImpl));
    expect(result.sent).toBe(1);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('flags the channel on a config error without counting a failure', async () => {
    const { database, log } = createFakeDatabase({
      claimed: [claimedRow()],
      configJson: await configJson(),
    });
    const fetchImpl = (async () =>
      jsonResponse(
        { ok: false, error_code: 400, description: 'chat not found' },
        400,
      )) as unknown as typeof fetch;

    const result = await runShareSender(database, options(fetchImpl));

    expect(result).toMatchObject({ deferred: 1, failed: 0 });
    const attention = log.find(
      (write) =>
        write.sql.includes('UPDATE share_channels') && write.sql.includes('needs_attention = ?'),
    );
    expect(attention?.params[0]).toBe(1);
  });

  it('pauses the channel on a channel-level rate limit', async () => {
    const { database, log } = createFakeDatabase({
      claimed: [claimedRow()],
      configJson: await configJson(),
    });
    const fetchImpl = (async () =>
      jsonResponse(
        { ok: false, error_code: 429, parameters: { retry_after: 30 } },
        429,
      )) as unknown as typeof fetch;

    const result = await runShareSender(database, options(fetchImpl));

    expect(result.deferred).toBe(1);
    expect(log.some((write) => write.sql.includes('rate_limit_hits = rate_limit_hits + 1'))).toBe(
      true,
    );
    const paused = log.find(
      (write) => write.sql.includes('UPDATE share_channels') && write.sql.includes('paused_until'),
    );
    expect(paused).toBeTruthy();
    expect(paused?.params[0]).toBe('2026-10-11T12:00:30.000Z');
  });

  it('fails only the job on an invalid payload', async () => {
    const { database } = createFakeDatabase({
      claimed: [claimedRow()],
      configJson: await configJson(),
    });
    const fetchImpl = (async () =>
      jsonResponse(
        { ok: false, error_code: 400, description: "can't parse entities" },
        400,
      )) as unknown as typeof fetch;

    const result = await runShareSender(database, options(fetchImpl));
    expect(result).toMatchObject({ failed: 1, deferred: 0 });
  });

  it('backs off on a transient failure', async () => {
    const { database, log } = createFakeDatabase({
      claimed: [claimedRow()],
      configJson: await configJson(),
    });
    const fetchImpl = (async () => jsonResponse({ ok: false }, 500)) as unknown as typeof fetch;

    const result = await runShareSender(database, options(fetchImpl));
    expect(result).toMatchObject({ deferred: 1, failed: 0 });

    const failure = log.find(
      (write) => write.sql.includes('UPDATE share_outbox') && write.sql.includes('failures = ?'),
    );
    expect(failure?.params[1]).toBe(1);
  });

  it('fails the job when the failures threshold is reached', async () => {
    const { database } = createFakeDatabase({
      claimed: [claimedRow({ failures: 4 })],
      configJson: await configJson(),
    });
    const fetchImpl = (async () => jsonResponse({ ok: false }, 500)) as unknown as typeof fetch;

    const result = await runShareSender(database, options(fetchImpl));
    expect(result).toMatchObject({ failed: 1, deferred: 0 });
  });

  it('skips a job whose post is no longer published', async () => {
    const { database, log } = createFakeDatabase({
      claimed: [claimedRow()],
      configJson: await configJson(),
      post: {
        id: 'post-1',
        status: 'draft',
        title: 'x',
        description: '',
        body: '',
        cover_url: null,
        affiliate: 0,
      },
    });
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await runShareSender(database, options(fetchImpl));
    expect(result).toMatchObject({ skipped: 1 });
    expect(log.some((write) => write.sql.includes("status = 'skipped'"))).toBe(true);
  });

  it('returns unprocessed claimed rows when the budget is exhausted', async () => {
    const { database, log } = createFakeDatabase({
      claimed: [claimedRow({ id: 'job-1' }), claimedRow({ id: 'job-2' })],
      configJson: await configJson(),
    });

    const result = await runShareSender(
      database,
      options(vi.fn() as unknown as typeof fetch, { budgetMs: -1 }),
    );

    expect(result.processed).toBe(0);
    expect(result.remaining).toBe(2);
    expect(log.some((write) => write.sql.includes('attempts = attempts - 1'))).toBe(true);
  });

  it('does nothing when there are no claimed jobs', async () => {
    const { database, log } = createFakeDatabase({ claimed: [], configJson: await configJson() });
    const result = await runShareSender(database, options(vi.fn() as unknown as typeof fetch));
    expect(result).toMatchObject({ processed: 0, remaining: 0 });
    expect(log).toHaveLength(1);
  });
});
