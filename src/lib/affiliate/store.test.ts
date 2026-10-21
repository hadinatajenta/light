import { describe, expect, it } from 'vitest';
import { AFFILIATE_LINKS_ENABLED_SETTING } from './settings';
import { loadAffiliateContext } from './store';

interface ProgramRow {
  id: string;
  name: string;
  network: string;
  tracking_id: string | null;
  link_template: string | null;
  status: string;
  disclosure: string;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  program_id: string;
  target: string;
  price_amount: number | null;
  price_currency: string | null;
  image_url: string | null;
  notes: string | null;
  topics: string;
  is_active: number;
  last_checked_at: string | null;
}

const PROGRAM: ProgramRow = {
  id: 'amazon',
  name: 'Amazon Associates',
  network: 'amazon',
  tracking_id: 'lightscripts-20',
  link_template: 'https://www.amazon.com/dp/{target}?tag={trackingId}',
  status: 'approved',
  disclosure: 'As an Amazon Associate I earn from qualifying purchases.',
};

const PRODUCT: ProductRow = {
  id: 'product-aeron',
  slug: 'aeron',
  name: 'Aeron Chair',
  program_id: 'amazon',
  target: 'B08XYZ1234',
  price_amount: 1395,
  price_currency: 'USD',
  image_url: null,
  notes: 'A long lasting mesh chair.',
  topics: '["chairs"]',
  is_active: 1,
  last_checked_at: null,
};

function createFakeDatabase(options: {
  programs?: ProgramRow[];
  products?: ProductRow[];
  settings?: Record<string, string>;
}): { database: D1Database; queryLog: string[] } {
  const programs = options.programs ?? [];
  const products = options.products ?? [];
  const settings = new Map(Object.entries(options.settings ?? {}));
  const queryLog: string[] = [];

  const database = {
    prepare(sql: string) {
      queryLog.push(sql);
      let params: unknown[] = [];

      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async all() {
          if (sql.includes('FROM affiliate_programs')) {
            return { results: programs };
          }

          if (sql.includes('FROM affiliate_products')) {
            const activeOnly = sql.includes('is_active = 1');
            return {
              results: activeOnly ? products.filter((row) => row.is_active === 1) : products,
            };
          }

          return { results: [] };
        },
        async first() {
          if (sql.includes('SELECT value FROM settings')) {
            const value = settings.get(params[0] as string);
            return value === undefined ? null : { value };
          }

          return null;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };

      return statement;
    },
  };

  return { database: database as unknown as D1Database, queryLog };
}

describe('loadAffiliateContext', () => {
  it('returns normal data when the setting is on', async () => {
    const { database } = createFakeDatabase({
      programs: [PROGRAM],
      products: [PRODUCT],
      settings: { [AFFILIATE_LINKS_ENABLED_SETTING]: '1' },
    });

    const context = await loadAffiliateContext(database);

    expect(context.links.size).toBe(1);
    expect(context.links.get('aeron')).toBe(
      'https://www.amazon.com/dp/B08XYZ1234?tag=lightscripts-20',
    );
    expect(context.products).toHaveLength(1);
    expect(context.products[0].slug).toBe('aeron');
    expect(context.disclosure).toBe(PROGRAM.disclosure);
  });

  it('returns normal data by default when the setting is absent', async () => {
    const { database } = createFakeDatabase({ programs: [PROGRAM], products: [PRODUCT] });

    const context = await loadAffiliateContext(database);

    expect(context.links.size).toBe(1);
    expect(context.products).toHaveLength(1);
  });

  it('returns empty links, products and disclosure when the setting is off', async () => {
    const { database } = createFakeDatabase({
      programs: [PROGRAM],
      products: [PRODUCT],
      settings: { [AFFILIATE_LINKS_ENABLED_SETTING]: '0' },
    });

    const context = await loadAffiliateContext(database);

    expect(context.links.size).toBe(0);
    expect(context.products).toEqual([]);
    expect(context.disclosure).toBe('');
  });

  it('does not read programs or products when the setting is off', async () => {
    const { database, queryLog } = createFakeDatabase({
      programs: [PROGRAM],
      products: [PRODUCT],
      settings: { [AFFILIATE_LINKS_ENABLED_SETTING]: '0' },
    });

    await loadAffiliateContext(database);

    expect(queryLog.some((sql) => sql.includes('FROM affiliate_programs'))).toBe(false);
    expect(queryLog.some((sql) => sql.includes('FROM affiliate_products'))).toBe(false);
  });
});
