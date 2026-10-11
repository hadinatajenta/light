import { describe, expect, it } from 'vitest';
import { runShareSweep } from './sweep';

const NOW = new Date('2026-10-11T12:00:00.000Z');

function createFakeDatabase(changes: number): {
  database: D1Database;
  log: { sql: string; params: unknown[] }[];
} {
  const log: { sql: string; params: unknown[] }[] = [];
  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async run() {
          log.push({ sql, params });
          return { meta: { changes } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, log };
}

describe('runShareSweep', () => {
  it('recovers stale sending rows with a failure increment and a fail threshold', async () => {
    const { database, log } = createFakeDatabase(3);
    const result = await runShareSweep(database, NOW);

    expect(result.swept).toBe(3);

    const write = log.at(-1);
    expect(write?.sql).toContain("status = 'sending'");
    expect(write?.sql).toContain('failures = failures + 1');
    expect(write?.sql).toContain("ELSE 'pending'");
    expect(write?.sql).toContain("THEN 'failed'");
    expect(write?.params[0]).toBe(5);
    expect(write?.params[1]).toBe(NOW.toISOString());
    expect(write?.params[2]).toBe('2026-10-11T11:50:00.000Z');
  });

  it('reports zero when nothing is stale', async () => {
    const { database } = createFakeDatabase(0);
    await expect(runShareSweep(database, NOW)).resolves.toEqual({ swept: 0 });
  });
});
