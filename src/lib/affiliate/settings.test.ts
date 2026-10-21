import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_LINKS_ENABLED_SETTING,
  readAffiliateLinksEnabled,
  saveAffiliateLinksEnabled,
} from './settings';

interface FakeWrite {
  sql: string;
  params: unknown[];
}

function createFakeDatabase(initial: Record<string, string> = {}): {
  database: D1Database;
  settings: Map<string, string>;
  writes: FakeWrite[];
} {
  const settings = new Map(Object.entries(initial));
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
          if (sql.includes('SELECT value FROM settings')) {
            const value = settings.get(params[0] as string);
            return value === undefined ? null : { value };
          }

          return null;
        },
        async run() {
          writes.push({ sql, params });

          if (sql.includes('INSERT INTO settings')) {
            settings.set(params[0] as string, params[1] as string);
          }

          return { meta: { changes: 1 } };
        },
      };

      return statement;
    },
  };

  return { database: database as unknown as D1Database, settings, writes };
}

describe('readAffiliateLinksEnabled', () => {
  it('defaults to on when the setting is absent', async () => {
    const { database } = createFakeDatabase();

    await expect(readAffiliateLinksEnabled(database)).resolves.toBe(true);
  });

  it('reads a stored zero as off', async () => {
    const { database } = createFakeDatabase({ [AFFILIATE_LINKS_ENABLED_SETTING]: '0' });

    await expect(readAffiliateLinksEnabled(database)).resolves.toBe(false);
  });

  it('reads a stored one as on', async () => {
    const { database } = createFakeDatabase({ [AFFILIATE_LINKS_ENABLED_SETTING]: '1' });

    await expect(readAffiliateLinksEnabled(database)).resolves.toBe(true);
  });

  it('treats any unrecognised value as on', async () => {
    const { database } = createFakeDatabase({ [AFFILIATE_LINKS_ENABLED_SETTING]: 'yes' });

    await expect(readAffiliateLinksEnabled(database)).resolves.toBe(true);
  });
});

describe('saveAffiliateLinksEnabled', () => {
  it('saves off and reads it back', async () => {
    const { database, writes } = createFakeDatabase();

    await saveAffiliateLinksEnabled(database, false);

    expect(writes[0].params).toEqual([AFFILIATE_LINKS_ENABLED_SETTING, '0', expect.any(String)]);
    await expect(readAffiliateLinksEnabled(database)).resolves.toBe(false);
  });

  it('saves on and reads it back', async () => {
    const { database } = createFakeDatabase({ [AFFILIATE_LINKS_ENABLED_SETTING]: '0' });

    await saveAffiliateLinksEnabled(database, true);

    await expect(readAffiliateLinksEnabled(database)).resolves.toBe(true);
  });
});
