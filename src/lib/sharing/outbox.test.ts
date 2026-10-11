import { describe, expect, it } from 'vitest';
import {
  approveShareJob,
  claimShareJobs,
  markShareFailed,
  markShareSent,
  recordShareFailure,
  recordShareRateLimit,
  rescheduleShareJob,
  retryShareJob,
  returnUnprocessedShares,
} from './outbox';

interface Write {
  sql: string;
  params: unknown[];
}

function createFakeDatabase(options: { rows?: unknown[]; changes?: number } = {}): {
  database: D1Database;
  log: Write[];
} {
  const log: Write[] = [];
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
          return { results: options.rows ?? [] };
        },
        async first() {
          log.push({ sql, params });
          return (options.rows ?? [])[0] ?? null;
        },
        async run() {
          log.push({ sql, params });
          return { meta: { changes: options.changes ?? 1 } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, log };
}

const NOW = '2026-10-11T12:00:00.000Z';

function outboxRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    post_id: 'post-1',
    channel_id: 'chan-1',
    status: 'sending',
    attempts: 2,
    failures: 0,
    rate_limit_hits: 0,
    next_attempt_at: NOW,
    age_reset_at: null,
    locked_at: NOW,
    provider_post_id: null,
    shared_url: null,
    error: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('claimShareJobs', () => {
  it('uses the fair window-function claim and binds the daily-cap inputs', async () => {
    const { database, log } = createFakeDatabase({ rows: [outboxRow()] });

    const jobs = await claimShareJobs(database, {
      now: NOW,
      limit: 5,
      perChannelLimit: 2,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 'job-1', channelId: 'chan-1', status: 'sending' });

    const claim = log.at(-1);
    expect(claim?.sql).toContain('ROW_NUMBER() OVER (PARTITION BY o.channel_id');
    expect(claim?.sql).toContain("o.status = 'pending'");
    expect(claim?.sql).toContain('c.needs_attention = 0');
    expect(claim?.sql).toContain("u.kind = 'share:' || c.id");
    expect(claim?.sql).toContain('RETURNING *');
    expect(claim?.params).toEqual([NOW, NOW, NOW, '2026-10-11', 2, 5]);
  });
});

describe('guarded writes', () => {
  it('markShareSent rejects a stale lease and accepts a live one', async () => {
    const { database, log } = createFakeDatabase({ changes: 1 });
    const applied = await markShareSent(database, 'job-1', {
      lockedAt: NOW,
      providerPostId: '99',
      sharedUrl: 'https://lightscripts.com/blog/post-1',
    });

    expect(applied).toBe(true);
    const write = log.at(-1);
    expect(write?.sql).toContain("status = 'sending' AND locked_at = ?");
    expect(write?.params).toContain(NOW);
    expect(write?.params).toContain('99');
  });

  it('markShareFailed returns false when the lease moved', async () => {
    const { database } = createFakeDatabase({ changes: 0 });
    const applied = await markShareFailed(database, 'job-1', { lockedAt: NOW, error: 'nope' });
    expect(applied).toBe(false);
  });

  it('rescheduleShareJob moves the row back to pending with the new attempt', async () => {
    const { database, log } = createFakeDatabase();
    await rescheduleShareJob(database, 'job-1', {
      lockedAt: NOW,
      nextAttemptAt: '2026-10-11T13:00:00.000Z',
    });

    const write = log.at(-1);
    expect(write?.sql).toContain("status = 'pending'");
    expect(write?.params).toContain('2026-10-11T13:00:00.000Z');
  });

  it('recordShareRateLimit increments rate_limit_hits', async () => {
    const { database, log } = createFakeDatabase();
    await recordShareRateLimit(database, 'job-1', {
      lockedAt: NOW,
      nextAttemptAt: '2026-10-11T13:00:00.000Z',
      error: 'slow down',
    });
    expect(log.at(-1)?.sql).toContain('rate_limit_hits = rate_limit_hits + 1');
  });
});

describe('recordShareFailure', () => {
  it('fails the row when there is no further attempt', async () => {
    const { database, log } = createFakeDatabase();
    await recordShareFailure(database, 'job-1', {
      lockedAt: NOW,
      failures: 5,
      nextAttemptAt: null,
      error: 'gone',
    });

    const write = log.at(-1);
    expect(write?.params?.[0]).toBe('failed');
    expect(write?.params?.[1]).toBe(5);
  });

  it('reschedules the row when an attempt remains', async () => {
    const { database, log } = createFakeDatabase();
    await recordShareFailure(database, 'job-1', {
      lockedAt: NOW,
      failures: 2,
      nextAttemptAt: '2026-10-11T12:05:00.000Z',
    });
    expect(log.at(-1)?.params?.[0]).toBe('pending');
  });
});

describe('manual resets', () => {
  it('retryShareJob resets counters and the age baseline', async () => {
    const { database, log } = createFakeDatabase();
    await retryShareJob(database, 'job-1');

    const sql = log.at(-1)?.sql ?? '';
    expect(sql).toContain('attempts = 0');
    expect(sql).toContain('failures = 0');
    expect(sql).toContain('rate_limit_hits = 0');
    expect(sql).toContain('age_reset_at = ?');
    expect(sql).toContain("status = 'pending'");
  });

  it('approveShareJob sets the age baseline and moves to pending', async () => {
    const { database, log } = createFakeDatabase();
    await approveShareJob(database, 'job-1');
    const sql = log.at(-1)?.sql ?? '';
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('age_reset_at = ?');
  });
});

describe('returnUnprocessedShares', () => {
  it('returns claimed rows to pending without a failure and decrements attempts', async () => {
    const { database, log } = createFakeDatabase({ changes: 2 });
    const changed = await returnUnprocessedShares(database, ['job-1', 'job-2']);

    expect(changed).toBe(2);
    const write = log.at(-1);
    expect(write?.sql).toContain('attempts = attempts - 1');
    expect(write?.sql).toContain("status = 'sending' AND id IN (?, ?)");
    expect(write?.params).toEqual([expect.any(String), 'job-1', 'job-2']);
  });

  it('does nothing when there are no ids', async () => {
    const { database, log } = createFakeDatabase();
    expect(await returnUnprocessedShares(database, [])).toBe(0);
    expect(log).toHaveLength(0);
  });
});
