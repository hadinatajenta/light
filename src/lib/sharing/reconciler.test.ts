import { describe, expect, it } from 'vitest';
import { computeEligibilityFloor, runShareReconciler } from './reconciler';

interface Write {
  sql: string;
  params: unknown[];
}

interface FakeOptions {
  settings?: Record<string, string>;
  channels?: Array<{ id: string; require_approval: number; started_at: string | null }>;
  posts?: string[];
  skipChanges?: number;
  insertChanges?: number;
}

function createFakeDatabase(options: FakeOptions = {}): { database: D1Database; log: Write[] } {
  const settings = options.settings ?? {};
  const channels = options.channels ?? [];
  const posts = options.posts ?? [];
  const log: Write[] = [];

  const channelRows = channels.map((channel) => ({
    id: channel.id,
    provider: 'telegram',
    label: channel.id,
    enabled: 1,
    config: '{}',
    daily_cap: null,
    require_approval: channel.require_approval,
    needs_attention: 0,
    paused_until: null,
    started_at: channel.started_at,
    last_error: null,
    last_success_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  }));

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
          if (sql.includes('FROM share_channels')) {
            return { results: channelRows };
          }
          if (sql.includes('FROM posts')) {
            return { results: posts.map((id) => ({ id })) };
          }
          return { results: [] };
        },
        async first() {
          log.push({ sql, params });
          if (sql.includes('FROM settings')) {
            const key = String(params[0]);
            return key in settings ? { value: settings[key] } : null;
          }
          return null;
        },
        async run() {
          log.push({ sql, params });
          const changes = sql.includes('INSERT OR IGNORE')
            ? (options.insertChanges ?? 1)
            : (options.skipChanges ?? 0);
          return { meta: { changes } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, log };
}

describe('computeEligibilityFloor', () => {
  it('takes the maximum of the cutoff, channel start, and max-age window', () => {
    const floor = computeEligibilityFloor({
      now: new Date('2026-10-11T12:00:00.000Z'),
      cutoff: '2026-10-01T00:00:00.000Z',
      startedAt: '2026-10-05T00:00:00.000Z',
      maxAgeDays: 14,
    });

    expect(floor).toBe('2026-10-05 00:00:00');
  });

  it('falls back to the max-age window when there is no cutoff or start', () => {
    const floor = computeEligibilityFloor({
      now: new Date('2026-10-11T12:00:00.000Z'),
      cutoff: null,
      startedAt: null,
      maxAgeDays: 14,
    });

    expect(floor).toBe('2026-09-27 12:00:00');
  });
});

describe('runShareReconciler', () => {
  it('inserts one job per eligible published post per enabled channel', async () => {
    const { database, log } = createFakeDatabase({
      channels: [
        { id: 'auto', require_approval: 0, started_at: '2026-10-01T00:00:00.000Z' },
        { id: 'manual', require_approval: 1, started_at: '2026-10-01T00:00:00.000Z' },
      ],
      posts: ['post-a', 'post-b'],
      insertChanges: 1,
    });

    const result = await runShareReconciler(database, new Date('2026-10-11T12:00:00.000Z'));
    expect(result.inserted).toBe(4);

    const inserts = log.filter((write) => write.sql.includes('INSERT OR IGNORE'));
    expect(inserts).toHaveLength(4);

    const statuses = inserts.map((write) => write.params[3]);
    expect(statuses.filter((status) => status === 'pending')).toHaveLength(2);
    expect(statuses.filter((status) => status === 'awaiting_approval')).toHaveLength(2);

    const postIds = inserts.map((write) => write.params[1]);
    expect([...new Set(postIds)].sort()).toEqual(['post-a', 'post-b']);
  });

  it('ignores conflicting rows', async () => {
    const { database } = createFakeDatabase({
      channels: [{ id: 'auto', require_approval: 0, started_at: null }],
      posts: ['post-a'],
      insertChanges: 0,
    });

    const result = await runShareReconciler(database, new Date('2026-10-11T12:00:00.000Z'));
    expect(result.inserted).toBe(0);
  });

  it('creates no rows while sharing is paused but still skips stale rows', async () => {
    const { database, log } = createFakeDatabase({
      settings: { share_paused: '1' },
      channels: [{ id: 'auto', require_approval: 0, started_at: null }],
      posts: ['post-a'],
      skipChanges: 3,
    });

    const result = await runShareReconciler(database, new Date('2026-10-11T12:00:00.000Z'));
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(3);
    expect(log.some((write) => write.sql.includes('INSERT OR IGNORE'))).toBe(false);
    expect(log.some((write) => write.sql.includes("status = 'skipped'"))).toBe(true);
  });

  it('marks pending and awaiting rows skipped when the post is not published', async () => {
    const { database, log } = createFakeDatabase({ settings: {}, skipChanges: 1 });

    await runShareReconciler(database, new Date('2026-10-11T12:00:00.000Z'));

    const skip = log.find((write) => write.sql.includes("status = 'skipped'"));
    expect(skip?.sql).toContain("status IN ('pending', 'awaiting_approval')");
    expect(skip?.sql).toContain("WHERE status = 'published'");
  });
});
