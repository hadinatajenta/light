import { describe, expect, it } from 'vitest';
import { importAffiliateReport, readCommissionCoverage, resolveCommissionCoverage } from './report';
import { resolveAnalystWindow } from './window';

const WINDOW = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));

const HEADER = 'Order ID,Order Date,ASIN,Item Commission,Currency,Order Status,Clicks,Orders\n';
const SAMPLE_LINES = [
  '111-2223334,2026-02-20,B0TEST,9.99,USD,Shipped,3,1',
  '111-2223335,2026-02-21,B0MISSING,1.00,USD,Shipped,0,2',
].join('\n');

describe('resolveCommissionCoverage', () => {
  it('is unknown without any overlapping report', () => {
    const coverage = resolveCommissionCoverage([], WINDOW);

    expect(coverage).toMatchObject({ state: 'unknown', coveredDays: 0, totalDays: 28 });
    expect(coverage.latestPeriodEnd).toBeNull();
  });

  it('is partial when a report covers part of the window', () => {
    const coverage = resolveCommissionCoverage(
      [{ periodStart: '2026-02-01', periodEnd: '2026-02-28' }],
      WINDOW,
    );

    expect(coverage.state).toBe('partial');
    expect(coverage.coveredDays).toBe(14);
    expect(coverage.latestPeriodEnd).toBe('2026-02-28');
  });

  it('is known when reports cover every window day', () => {
    const coverage = resolveCommissionCoverage(
      [
        { periodStart: '2026-02-01', periodEnd: '2026-02-28' },
        { periodStart: '2026-03-01', periodEnd: '2026-03-31' },
      ],
      WINDOW,
    );

    expect(coverage).toMatchObject({ state: 'known', coveredDays: 28, totalDays: 28 });
    expect(coverage.latestPeriodEnd).toBe('2026-03-31');
  });

  it('stays unknown for a stale report that ends before the window', () => {
    const coverage = resolveCommissionCoverage(
      [{ periodStart: '2025-12-01', periodEnd: '2025-12-31' }],
      WINDOW,
    );

    expect(coverage.state).toBe('unknown');
  });
});

describe('readCommissionCoverage', () => {
  it('queries only reports that overlap the window', async () => {
    const bound: unknown[] = [];
    const database = {
      prepare() {
        const statement = {
          bind(...params: unknown[]) {
            bound.push(...params);
            return statement;
          },
          async all() {
            return { results: [{ period_start: '2026-02-01', period_end: '2026-02-28' }] };
          },
        };
        return statement;
      },
    } as unknown as D1Database;

    const coverage = await readCommissionCoverage(database, WINDOW);

    expect(bound).toEqual([WINDOW.end, WINDOW.start]);
    expect(coverage.state).toBe('partial');
  });
});

interface StoredLine {
  reportId: string;
  productId: string | null;
  target: string;
  lineHash: string;
  commissionCents: number;
}

function importDatabase(products: Array<{ id: string; target: string }>): {
  database: D1Database;
  reports: Array<{ id: string; network: string; periodStart: string; periodEnd: string }>;
  lines: StoredLine[];
  productQueryParams: unknown[];
} {
  const reports: Array<{ id: string; network: string; periodStart: string; periodEnd: string }> =
    [];
  const lines: StoredLine[] = [];
  const hashes = new Set<string>();
  const productQueryParams: unknown[] = [];

  const database = {
    prepare(sql: string) {
      const params: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          params.splice(0, params.length, ...bound);
          return statement;
        },
        async first() {
          if (sql.includes('SELECT id FROM affiliate_earnings_reports')) {
            const match = reports.find(
              (report) =>
                report.network === String(params[0]) &&
                report.periodStart === String(params[1]) &&
                report.periodEnd === String(params[2]),
            );
            return match ? { id: match.id } : null;
          }

          return { total: 0 };
        },
        async all() {
          if (sql.includes('FROM affiliate_products')) {
            productQueryParams.push(...params);
            return { results: products };
          }

          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO affiliate_earnings_reports')) {
            const existing = reports.find(
              (report) =>
                report.network === String(params[1]) &&
                report.periodStart === String(params[2]) &&
                report.periodEnd === String(params[3]),
            );

            if (!existing) {
              reports.push({
                id: String(params[0]),
                network: String(params[1]),
                periodStart: String(params[2]),
                periodEnd: String(params[3]),
              });
            }

            return { meta: { changes: 1 } };
          }

          if (sql.includes('INSERT INTO affiliate_earnings_lines')) {
            const lineHash = String(params[10]);

            if (hashes.has(lineHash)) {
              return { meta: { changes: 0 } };
            }

            hashes.add(lineHash);
            lines.push({
              reportId: String(params[1]),
              productId: params[2] === null ? null : String(params[2]),
              target: String(params[3]),
              lineHash,
              commissionCents: Number(params[7]),
            });

            return { meta: { changes: 1 } };
          }

          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };

  return { database: database as unknown as D1Database, reports, lines, productQueryParams };
}

describe('importAffiliateReport', () => {
  it('stores resolved and unmatched lines and counts them', async () => {
    const fake = importDatabase([
      { id: 'p1', target: 'B0TEST' },
      { id: 'p2', target: ' B0LAMP ' },
    ]);
    const result = await importAffiliateReport(fake.database, {
      network: 'amazon',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      sourceFilename: 'february.csv',
      importedBy: 'owner@example.com',
      content: HEADER + SAMPLE_LINES,
    });

    expect(result.imported).toBe(2);
    expect(result.unmatched).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.reportId).toBe(fake.reports[0]?.id);
    expect(fake.lines.map((line) => line.productId)).toEqual(['p1', null]);
    expect(fake.productQueryParams).toEqual(['amazon']);
  });

  it('deduplicates an identical observation but keeps a revised one', async () => {
    const fake = importDatabase([{ id: 'p1', target: 'B0TEST' }]);
    const input = {
      network: 'amazon' as const,
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      sourceFilename: 'february.csv',
      importedBy: 'owner@example.com',
      content: HEADER + SAMPLE_LINES,
    };

    await importAffiliateReport(fake.database, input);
    const repeated = await importAffiliateReport(fake.database, input);

    expect(repeated.imported).toBe(0);
    expect(repeated.skipped).toBe(2);
    expect(fake.lines).toHaveLength(2);

    const revised = await importAffiliateReport(fake.database, {
      ...input,
      content: `${HEADER}111-2223334,2026-02-20,B0TEST,12.34,USD,Shipped,3,1`,
    });

    expect(revised.imported).toBe(1);
    expect(fake.lines).toHaveLength(3);
    expect(new Set(fake.lines.map((line) => line.lineHash)).size).toBe(3);
  });

  it('counts rows the parser could not read in skipped', async () => {
    const fake = importDatabase([{ id: 'p1', target: 'B0TEST' }]);
    const result = await importAffiliateReport(fake.database, {
      network: 'amazon',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      sourceFilename: null,
      importedBy: null,
      content: `${HEADER.trimEnd()}\nTotal,,,5.00,,`,
    });

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('rejects an inverted period and a report without parseable lines', async () => {
    const fake = importDatabase([]);

    await expect(
      importAffiliateReport(fake.database, {
        network: 'amazon',
        periodStart: '2026-03-01',
        periodEnd: '2026-02-01',
        sourceFilename: null,
        importedBy: null,
        content: HEADER + SAMPLE_LINES,
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_REPORT_INVALID' });

    await expect(
      importAffiliateReport(fake.database, {
        network: 'amazon',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        sourceFilename: null,
        importedBy: null,
        content: 'Foo,Bar\n1,2',
      }),
    ).rejects.toMatchObject({ code: 'ANALYST_REPORT_INVALID' });
  });
});
