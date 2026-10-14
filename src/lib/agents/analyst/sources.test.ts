import { describe, expect, it } from 'vitest';
import type { RedirectMiss } from '../../affiliate/clicks';
import { encryptSecret } from '../secrets';
import {
  type AnalystAssemblyInput,
  type AnalystSourceStatus,
  assembleAnalystData,
  buildDataQuality,
  loadAnalystSources,
  selectFatalSourceFailures,
} from './sources';
import { resolveAnalystWindow } from './window';

const WINDOW = resolveAnalystWindow(new Date('2026-03-15T10:00:00.000Z'));
const TEST_KEY_MATERIAL = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

function stubDatabase(input: {
  settings?: Record<string, string>;
  allResults?: Array<{ match: string; results: unknown[] }>;
  firstResults?: Array<{ match: string; result: unknown }>;
}): D1Database {
  return {
    prepare(sql: string) {
      const params: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          params.push(...bound);
          return statement;
        },
        async all() {
          for (const entry of input.allResults ?? []) {
            if (sql.includes(entry.match)) {
              return { results: entry.results };
            }
          }
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM settings')) {
            return { value: input.settings?.[String(params[0])] ?? '' };
          }
          for (const entry of input.firstResults ?? []) {
            if (sql.includes(entry.match)) {
              return entry.result;
            }
          }
          return { total: 0 };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function buildInput(overrides: Partial<AnalystAssemblyInput> = {}): AnalystAssemblyInput {
  return {
    window: WINDOW,
    posts: [],
    windowViews: [],
    baselineViews: [],
    totalViews: 0,
    totalClicks: 0,
    products: [],
    productClicks: [],
    redirectMisses: [],
    ...overrides,
  };
}

function miss(overrides: Partial<RedirectMiss> = {}): RedirectMiss {
  return {
    day: '2026-03-01',
    slug: 'chair',
    referrerPath: '/blog/chair-guide',
    count: 1,
    ...overrides,
  };
}

describe('assembleAnalystData', () => {
  it('attaches window and baseline views to their posts', () => {
    const data = assembleAnalystData(
      buildInput({
        posts: [
          {
            id: 'guide',
            title: 'Guide',
            category: 'chairs',
            body: 'Body',
            published_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
          },
          {
            id: 'quiet',
            title: 'Quiet',
            category: null,
            body: '',
            published_at: null,
            updated_at: '2026-01-02T00:00:00.000Z',
          },
        ],
        windowViews: [{ post_id: 'guide', total: 12 }],
        baselineViews: [{ post_id: 'guide', total: 7 }],
      }),
    );

    expect(data.posts[0]).toMatchObject({ id: 'guide', views: 12, baselineViews: 7 });
    expect(data.posts[1]).toMatchObject({ id: 'quiet', views: 0, baselineViews: 0 });
    expect(data.totals.publishedPosts).toBe(2);
  });

  it('ignores view rows that do not point at a post', () => {
    const data = assembleAnalystData(buildInput({ windowViews: [{ post_id: null, total: 9 }] }));

    expect(data.posts).toEqual([]);
    expect(data.totals.views).toBe(0);
  });

  it('extracts product slugs from published bodies', () => {
    const data = assembleAnalystData(
      buildInput({
        posts: [
          {
            id: 'guide',
            title: 'Guide',
            category: null,
            body: 'See [the chair](product:office-chair) and [the lamp](product:desk-lamp).',
            published_at: null,
            updated_at: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(data.posts[0]?.productSlugs).toEqual(['office-chair', 'desk-lamp']);
  });

  it('builds programs and attaches clicks by product id', () => {
    const data = assembleAnalystData(
      buildInput({
        products: [
          {
            id: 'p1',
            slug: 'office-chair',
            name: 'Office Chair',
            target: 'B0TEST',
            is_active: 1,
            topics: '["chairs"]',
            program_id: 'amazon',
            program_name: 'Amazon Associates',
            program_network: 'amazon',
            program_status: 'approved',
            program_tracking_id: 'tag-20',
            program_link_template: 'https://example.com/dp/{target}?tag={trackingId}',
            program_disclosure: 'Disclosure',
          },
          {
            id: 'p2',
            slug: 'desk-lamp',
            name: 'Desk Lamp',
            target: 'B0LAMP',
            is_active: 0,
            topics: null,
            program_id: null,
            program_name: null,
            program_network: null,
            program_status: null,
            program_tracking_id: null,
            program_link_template: null,
            program_disclosure: null,
          },
        ],
        productClicks: [{ product_id: 'p1', total: 4 }],
      }),
    );

    expect(data.products[0]).toMatchObject({
      slug: 'office-chair',
      isActive: true,
      topics: ['chairs'],
      clicks: 4,
      program: { id: 'amazon', status: 'approved', trackingId: 'tag-20' },
    });
    expect(data.products[1]).toMatchObject({
      slug: 'desk-lamp',
      isActive: false,
      topics: [],
      clicks: 0,
      program: null,
    });
  });

  it('aggregates redirect misses inside the window and drops the rest', () => {
    const data = assembleAnalystData(
      buildInput({
        redirectMisses: [
          miss({ day: '2026-02-20', slug: 'lamp', referrerPath: '/a', count: 2 }),
          miss({ day: '2026-02-21', slug: 'lamp', referrerPath: '/b', count: 1 }),
          miss({ day: '2026-02-21', slug: 'lamp', referrerPath: '/b', count: 5 }),
          miss({ day: '2026-02-01', slug: 'old', count: 9 }),
          miss({ day: '2026-02-15', slug: 'edge', count: 3 }),
          miss({ day: '2026-03-15', slug: 'future', count: 3 }),
        ],
      }),
    );

    expect(data.redirectMisses).toEqual([
      { slug: 'edge', missCount: 3, referrerPaths: ['/blog/chair-guide'] },
      { slug: 'lamp', missCount: 8, referrerPaths: ['/a', '/b'] },
    ]);
  });

  it('passes source totals through with a floor of zero', () => {
    const data = assembleAnalystData(buildInput({ totalViews: -5, totalClicks: -2 }));

    expect(data.totals).toEqual({ views: 0, clicks: 0, publishedPosts: 0 });
  });
});

describe('buildDataQuality', () => {
  it('records one entry per source', () => {
    const statuses: AnalystSourceStatus[] = [
      { source: 'clicks', status: 'ok', detail: '', remediation: '', rowCount: 3 },
      { source: 'post_views', status: 'ok', detail: '', remediation: '', rowCount: 4 },
      { source: 'gsc', status: 'missing', detail: '', remediation: '', rowCount: 0 },
      { source: 'ga4', status: 'missing', detail: '', remediation: '', rowCount: 0 },
      { source: 'affiliate_report', status: 'error', detail: '', remediation: '', rowCount: 0 },
    ];

    expect(buildDataQuality(statuses)).toEqual({
      clicks: 'ok',
      post_views: 'ok',
      gsc: 'missing',
      ga4: 'missing',
      affiliate_report: 'error',
    });
  });
});

describe('loadAnalystSources', () => {
  it('reports unavailable sources without throwing and never fakes data', async () => {
    const database = {
      prepare(sql: string) {
        const statement = {
          bind() {
            return statement;
          },
          async all() {
            if (sql.includes('FROM posts')) {
              return { results: [] };
            }
            if (sql.includes('FROM post_views')) {
              return { results: [] };
            }
            if (sql.includes('FROM affiliate_products')) {
              return { results: [] };
            }
            if (sql.includes('FROM clicks')) {
              return { results: [] };
            }
            if (sql.includes('FROM redirect_misses')) {
              return { results: [] };
            }
            if (sql.includes('FROM affiliate_earnings_reports')) {
              return { results: [] };
            }
            throw new Error(`unexpected query: ${sql}`);
          },
          async first() {
            return { total: 0 };
          },
        };
        return statement;
      },
    } as unknown as D1Database;

    const { statuses } = await loadAnalystSources(database, WINDOW);

    expect(statuses.map((status) => status.source)).toEqual([
      'clicks',
      'post_views',
      'gsc',
      'ga4',
      'affiliate_report',
    ]);
    expect(statuses[0]).toMatchObject({ status: 'ok', rowCount: 0 });
    expect(statuses[1]).toMatchObject({ status: 'ok', rowCount: 0 });
    expect(statuses[2]).toMatchObject({
      status: 'missing',
      remediation: expect.stringContaining('Search Console'),
    });
    expect(statuses[3]).toMatchObject({
      status: 'missing',
      remediation: expect.stringContaining('GA4'),
    });
    expect(statuses[4]).toMatchObject({
      status: 'missing',
      remediation: expect.stringContaining('Amazon Associates Central'),
    });
  });

  it('reports a read failure as an error status instead of throwing', async () => {
    const database = {
      prepare(sql: string) {
        const statement = {
          bind() {
            return statement;
          },
          async all() {
            if (sql.includes('FROM settings')) {
              return { results: [] };
            }
            throw new Error('no such table: post_views');
          },
          async first() {
            if (sql.includes('FROM settings')) {
              return { value: '' };
            }
            throw new Error('no such table: post_views');
          },
        };
        return statement;
      },
    } as unknown as D1Database;

    const { statuses } = await loadAnalystSources(database, WINDOW);

    expect(statuses[0]).toMatchObject({ source: 'clicks', status: 'error' });
    expect(statuses[1]).toMatchObject({ source: 'post_views', status: 'error' });
    expect(statuses[1]?.detail).toContain('no such table: post_views');
  });

  it('keeps a rejected Google credential from aborting the run', async () => {
    const serviceAccount = JSON.stringify({
      type: 'service_account',
      client_email: 'analyst@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n',
      project_id: 'light-analytics',
    });
    const database = stubDatabase({
      settings: {
        analyst_gsc_service_account: await encryptSecret(serviceAccount, TEST_KEY_MATERIAL),
        analyst_gsc_property: 'https://lightscripts.com/',
        analyst_gsc_access_token: await encryptSecret(
          JSON.stringify({ accessToken: 'cached-token', expiresAt: Date.now() + 3_600_000 }),
          TEST_KEY_MATERIAL,
        ),
      },
    });
    const fetchImpl = async () => new Response('{}', { status: 401 });

    const { statuses } = await loadAnalystSources(database, WINDOW, {
      fetchImpl,
      keyMaterial: TEST_KEY_MATERIAL,
    });
    const gsc = statuses.find((status) => status.source === 'gsc');

    expect(gsc).toMatchObject({ status: 'error' });
    expect(gsc?.detail).toContain('rejected');
    expect(selectFatalSourceFailures(statuses)).toEqual([]);
  });

  it('reads a covered affiliate report and attaches commission per product', async () => {
    const database = stubDatabase({
      allResults: [
        {
          match: 'FROM affiliate_earnings_reports',
          results: [{ period_start: WINDOW.start, period_end: WINDOW.end }],
        },
        {
          match: 'FROM affiliate_products',
          results: [
            {
              id: 'p1',
              slug: 'office-chair',
              name: 'Office Chair',
              target: 'B0TEST',
              is_active: 1,
              topics: null,
              program_id: 'amazon',
              program_name: 'Amazon Associates',
              program_network: 'amazon',
              program_status: 'approved',
              program_tracking_id: 'tag-20',
              program_link_template: 'https://example.com/dp/{target}?tag={trackingId}',
              program_disclosure: '',
            },
          ],
        },
        {
          match: 'SUM(orders)',
          results: [{ product_id: 'p1', orders: 2, commission_cents: 0 }],
        },
      ],
      firstResults: [
        {
          match: 'COALESCE(SUM(CASE WHEN product_id IS NULL',
          result: { lines: 4, unmatched: 1 },
        },
      ],
    });

    const { data, statuses } = await loadAnalystSources(database, WINDOW);
    const report = statuses.find((status) => status.source === 'affiliate_report');

    expect(report).toMatchObject({ status: 'ok', rowCount: 4 });
    expect(report?.detail).toContain('1 line(s) could not be matched');
    expect(data.commissionCoverage).toBe('known');
    expect(data.products[0]).toMatchObject({ slug: 'office-chair', orders: 2, commissionCents: 0 });
  });
});

describe('selectFatalSourceFailures', () => {
  it('fails the run only for database backed sources', () => {
    const statuses: AnalystSourceStatus[] = [
      { source: 'clicks', status: 'error', detail: '', remediation: '', rowCount: 0 },
      { source: 'post_views', status: 'error', detail: '', remediation: '', rowCount: 0 },
      { source: 'gsc', status: 'error', detail: '', remediation: '', rowCount: 0 },
      { source: 'ga4', status: 'error', detail: '', remediation: '', rowCount: 0 },
      { source: 'affiliate_report', status: 'error', detail: '', remediation: '', rowCount: 0 },
    ];

    expect(selectFatalSourceFailures(statuses).map((status) => status.source)).toEqual([
      'clicks',
      'post_views',
      'affiliate_report',
    ]);
  });
});
