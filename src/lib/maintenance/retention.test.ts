import { describe, expect, it } from 'vitest';
import {
  RETENTION_DAYS,
  RETENTION_INTERVAL_MS,
  retentionCutoffIso,
  runRetention,
  shouldRunRetention,
} from './retention';

const NOW = Date.parse('2026-10-12T12:00:00.000Z');

interface FakeWrite {
  sql: string;
  params: unknown[];
}

function createFakeDatabase(options: {
  ranAt: string | null;
  activityChanges?: number;
  runsChanges?: number;
}): { database: D1Database; writes: FakeWrite[] } {
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
          return options.ranAt ? { ran_at: options.ranAt } : null;
        },
        async run() {
          writes.push({ sql, params });

          if (sql.includes('DELETE FROM activity')) {
            return { meta: { changes: options.activityChanges ?? 0 } };
          }
          if (sql.includes('DELETE FROM agent_runs')) {
            return { meta: { changes: options.runsChanges ?? 0 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, writes };
}

describe('retentionCutoffIso', () => {
  it('returns the moment before which rows are expired', () => {
    expect(retentionCutoffIso(NOW)).toBe(
      new Date(NOW - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(retentionCutoffIso(NOW)).toBe('2026-07-14T12:00:00.000Z');
  });

  it('puts a row written 91 days ago before the cutoff', () => {
    const createdAt = new Date(NOW - 91 * 24 * 60 * 60 * 1000).toISOString();

    expect(createdAt < retentionCutoffIso(NOW)).toBe(true);
  });

  it('puts a row written one millisecond before the cutoff in the expired set', () => {
    expect('2026-07-14T11:59:59.999Z' < retentionCutoffIso(NOW)).toBe(true);
  });

  it('keeps a row written exactly at the cutoff out of the expired set', () => {
    expect('2026-07-14T12:00:00.000Z' < retentionCutoffIso(NOW)).toBe(false);
  });
});

describe('shouldRunRetention', () => {
  it('runs when no previous run is recorded', () => {
    expect(shouldRunRetention(null, NOW)).toBe(true);
    expect(shouldRunRetention('', NOW)).toBe(true);
  });

  it('runs when the recorded timestamp is not parseable', () => {
    expect(shouldRunRetention('yesterday', NOW)).toBe(true);
  });

  it('skips while the last run is newer than the interval', () => {
    expect(shouldRunRetention(new Date(NOW - 60 * 60 * 1000).toISOString(), NOW)).toBe(false);
  });

  it('runs when the last run is exactly one interval old', () => {
    expect(shouldRunRetention(new Date(NOW - RETENTION_INTERVAL_MS).toISOString(), NOW)).toBe(true);
  });

  it('runs when the last run is older than the interval', () => {
    expect(shouldRunRetention(new Date(NOW - RETENTION_INTERVAL_MS - 1).toISOString(), NOW)).toBe(
      true,
    );
  });

  it('skips when the recorded timestamp lies in the future', () => {
    expect(shouldRunRetention(new Date(NOW + 60_000).toISOString(), NOW)).toBe(false);
  });
});

describe('runRetention', () => {
  it('skips without writing when the last run is recent', async () => {
    const { database, writes } = createFakeDatabase({
      ranAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
    });

    await expect(runRetention(database, NOW)).resolves.toEqual({
      skipped: true,
      activityDeleted: 0,
      runsDeleted: 0,
    });
    expect(writes).toEqual([]);
  });

  it('deletes expired activity and finished runs, then records the run', async () => {
    const { database, writes } = createFakeDatabase({
      ranAt: null,
      activityChanges: 12,
      runsChanges: 3,
    });

    await expect(runRetention(database, NOW)).resolves.toEqual({
      skipped: false,
      activityDeleted: 12,
      runsDeleted: 3,
    });

    expect(writes[0].sql).toContain('DELETE FROM activity WHERE created_at <');
    expect(writes[0].params).toEqual([retentionCutoffIso(NOW)]);
    expect(writes[1].sql).toContain('DELETE FROM agent_runs');
    expect(writes[1].sql).toContain("status != 'running'");
    expect(writes[1].params).toEqual([retentionCutoffIso(NOW)]);
    expect(writes[2].sql).toContain('INSERT INTO maintenance_state');
    expect(writes[2].params).toEqual(['retention', new Date(NOW).toISOString()]);
  });

  it('runs again once the interval since the recorded run has elapsed', async () => {
    const { database, writes } = createFakeDatabase({
      ranAt: new Date(NOW - RETENTION_INTERVAL_MS).toISOString(),
    });

    await expect(runRetention(database, NOW)).resolves.toMatchObject({ skipped: false });
    expect(writes).toHaveLength(3);
  });

  it('reports zero deletions when no rows are affected', async () => {
    const { database } = createFakeDatabase({ ranAt: null });

    await expect(runRetention(database, NOW)).resolves.toEqual({
      skipped: false,
      activityDeleted: 0,
      runsDeleted: 0,
    });
  });
});
