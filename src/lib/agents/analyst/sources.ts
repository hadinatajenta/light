import type { AffiliateNetwork, AffiliateProgram, AffiliateStatus } from '@/config/monetization';
import { listRecentRedirectMisses, type RedirectMiss } from '../../affiliate/clicks';
import { extractProductSlugs } from '../../affiliate/store';
import { addViewDays, viewDayKey } from '../../analytics/views';
import { parseProductTopics } from '../catalog';
import { normalizeTopicTitle } from '../topics';
import { readGa4Credentials, readGscCredentials } from './credentials';
import { collectGa4, compareGa4ToFirstParty, GA4_SCOPE, GA4_VIEW_MISMATCH_FACTOR } from './ga4';
import { type GoogleFetch, resolveGoogleAccessToken } from './google-auth';
import { collectSearchConsole, GSC_SCOPE, type GscCollection, querySearchAnalytics } from './gsc';
import {
  type AnalystCommissionRow,
  type CommissionCoverageState,
  readCommissionByProduct,
  readCommissionCoverage,
  readCommissionLineCounts,
} from './report';
import type { AnalystWindow } from './window';

export const ANALYST_SOURCES = ['clicks', 'post_views', 'gsc', 'ga4', 'affiliate_report'] as const;

export type AnalystSource = (typeof ANALYST_SOURCES)[number];

export type AnalystSourceState = 'ok' | 'missing' | 'error';

export const ANALYST_DATABASE_SOURCES = ['clicks', 'post_views', 'affiliate_report'] as const;

export const REDIRECT_MISS_SCAN_LIMIT = 50;

export interface AnalystSourceStatus {
  source: AnalystSource;
  status: AnalystSourceState;
  detail: string;
  remediation: string;
  rowCount: number;
}

export interface AnalystPostSource {
  id: string;
  title: string;
  category: string | null;
  publishedAt: string | null;
  updatedAt: string;
  body: string;
  views: number;
  baselineViews: number;
  productSlugs: string[];
}

export interface AnalystProductSource {
  slug: string;
  name: string;
  target: string;
  isActive: boolean;
  topics: string[];
  program: AffiliateProgram | null;
  clicks: number;
  orders: number;
  commissionCents: number;
}

export interface AnalystRedirectSource {
  slug: string;
  missCount: number;
  referrerPaths: string[];
}

export interface AnalystGscPageSource {
  postId: string;
  impressions: number;
  clicks: number;
  positionSum: number;
}

export interface AnalystGscQuerySource {
  query: string;
  impressions: number;
  clicks: number;
  positionSum: number;
}

export interface AnalystGscSource {
  pages: AnalystGscPageSource[];
  queries: AnalystGscQuerySource[];
  rankedQueries: string[];
  unmappedPages: string[];
  truncated: string[];
}

export const EMPTY_GSC_SOURCE: AnalystGscSource = {
  pages: [],
  queries: [],
  rankedQueries: [],
  unmappedPages: [],
  truncated: [],
};

export interface AnalystTotals {
  views: number;
  clicks: number;
  publishedPosts: number;
}

export interface AnalystData {
  posts: AnalystPostSource[];
  products: AnalystProductSource[];
  redirectMisses: AnalystRedirectSource[];
  totals: AnalystTotals;
  gsc: AnalystGscSource;
  commissionCoverage: CommissionCoverageState;
}

export interface AnalystPostRow {
  id: string;
  title: string;
  category: string | null;
  body: string;
  published_at: string | null;
  updated_at: string;
}

export interface AnalystViewRow {
  post_id: string | null;
  total: number;
}

export interface AnalystProductRow {
  id: string;
  slug: string;
  name: string;
  target: string;
  is_active: number;
  topics: string | null;
  program_id: string | null;
  program_name: string | null;
  program_network: string | null;
  program_status: string | null;
  program_tracking_id: string | null;
  program_link_template: string | null;
  program_disclosure: string | null;
}

export interface AnalystClickRow {
  product_id: string;
  total: number;
}

export interface AnalystAssemblyInput {
  window: AnalystWindow;
  posts: AnalystPostRow[];
  windowViews: AnalystViewRow[];
  baselineViews: AnalystViewRow[];
  totalViews: number;
  totalClicks: number;
  products: AnalystProductRow[];
  productClicks: AnalystClickRow[];
  redirectMisses: RedirectMiss[];
  gsc?: AnalystGscSource;
  commissionCoverage?: CommissionCoverageState;
  productCommissions?: AnalystCommissionRow[];
}

export interface AnalystSourceLoadOptions {
  fetchImpl?: GoogleFetch;
  signal?: AbortSignal;
  keyMaterial?: string;
  now?: Date;
}

export interface AnalystSourceLoad {
  data: AnalystData;
  statuses: AnalystSourceStatus[];
}

const MISSING_SOURCES: Record<'gsc' | 'ga4' | 'affiliate_report', AnalystSourceStatus> = {
  gsc: {
    source: 'gsc',
    status: 'missing',
    detail: 'Search Console credentials are not configured.',
    remediation:
      'Open Settings, then Performance, and paste a Google Cloud service account JSON with the Search Console API enabled, together with the property. Grant the service account email read access to the property in the Search Console console, then run the connection test.',
    rowCount: 0,
  },
  ga4: {
    source: 'ga4',
    status: 'missing',
    detail: 'GA4 credentials are not configured.',
    remediation:
      'Open Settings, then Performance, and paste a Google Cloud service account JSON with the Analytics Data API enabled, together with the numeric property id. Grant the service account email Viewer on the GA4 property, then run the connection test.',
    rowCount: 0,
  },
  affiliate_report: {
    source: 'affiliate_report',
    status: 'missing',
    detail: 'No Amazon order report covers this window.',
    remediation:
      'Download the order report from Amazon Associates Central, then open Settings, then Performance, and import it. Until a report covering this window exists, commission cannot be judged and the commission rule stays switched off.',
    rowCount: 0,
  },
};

const GSC_FAILURE_REMEDIATION =
  'Open Settings, Performance, and run Test. The test reports the exact rejection, and the fix is to re-add the service account email to the Search Console property or replace the key.';
const GA4_FAILURE_REMEDIATION =
  'Open Settings, Performance, and run Test. The test reports the exact rejection, and the fix is to grant the service account Viewer on the GA4 property or replace the key.';
const REPORT_FAILURE_REMEDIATION =
  'Check that migration 0028_affiliate_report.sql has been applied and that the affiliate_earnings_reports and affiliate_earnings_lines tables are readable.';

export function selectFatalSourceFailures(
  statuses: readonly AnalystSourceStatus[],
): AnalystSourceStatus[] {
  return statuses.filter(
    (status) =>
      status.status === 'error' &&
      (ANALYST_DATABASE_SOURCES as readonly AnalystSource[]).includes(status.source),
  );
}

function errorStatus(
  source: AnalystSource,
  error: unknown,
  remediation: string,
  rowCount: number,
): AnalystSourceStatus {
  const message = error instanceof Error ? error.message : 'Unknown error';

  return {
    source,
    status: 'error',
    detail: `${source} could not be read: ${message}`,
    remediation,
    rowCount,
  };
}

function toProgram(row: AnalystProductRow): AffiliateProgram | null {
  if (!row.program_id) {
    return null;
  }

  return {
    id: row.program_id,
    name: row.program_name ?? row.program_id,
    network: (row.program_network ?? 'direct') as AffiliateNetwork,
    trackingId: row.program_tracking_id,
    linkTemplate: row.program_link_template,
    status: (row.program_status ?? 'pending') as AffiliateStatus,
    disclosure: row.program_disclosure ?? '',
  };
}

export function assembleAnalystData(input: AnalystAssemblyInput): AnalystData {
  const windowViews = new Map(
    (input.windowViews ?? []).map((row) => [row.post_id ?? '', row.total]),
  );
  const baselineViews = new Map(
    (input.baselineViews ?? []).map((row) => [row.post_id ?? '', row.total]),
  );
  const clicksByProduct = new Map(
    (input.productClicks ?? []).map((row) => [row.product_id, row.total]),
  );
  const commissionByProduct = new Map(
    (input.productCommissions ?? []).map((row) => [row.productId, row]),
  );

  const products: AnalystProductSource[] = (input.products ?? []).map((row) => {
    const commission = commissionByProduct.get(row.id);

    return {
      slug: row.slug,
      name: row.name,
      target: row.target,
      isActive: row.is_active === 1,
      topics: parseProductTopics(row.topics),
      program: toProgram(row),
      clicks: clicksByProduct.get(row.id) ?? 0,
      orders: commission?.orders ?? 0,
      commissionCents: commission?.commissionCents ?? 0,
    };
  });

  const posts: AnalystPostSource[] = (input.posts ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    body: row.body,
    views: windowViews.get(row.id) ?? 0,
    baselineViews: baselineViews.get(row.id) ?? 0,
    productSlugs: extractProductSlugs(row.body),
  }));

  const redirects = new Map<string, AnalystRedirectSource>();

  for (const miss of input.redirectMisses ?? []) {
    if (miss.day < input.window.start || miss.day > input.window.end) {
      continue;
    }

    const entry = redirects.get(miss.slug) ?? {
      slug: miss.slug,
      missCount: 0,
      referrerPaths: [],
    };

    entry.missCount += miss.count;

    if (miss.referrerPath && !entry.referrerPaths.includes(miss.referrerPath)) {
      entry.referrerPaths.push(miss.referrerPath);
    }

    redirects.set(miss.slug, entry);
  }

  return {
    posts,
    products,
    redirectMisses: [...redirects.values()].sort((first, second) =>
      first.slug.localeCompare(second.slug),
    ),
    totals: {
      views: Math.max(input.totalViews, 0),
      clicks: Math.max(input.totalClicks, 0),
      publishedPosts: posts.length,
    },
    gsc: input.gsc ?? EMPTY_GSC_SOURCE,
    commissionCoverage: input.commissionCoverage ?? 'unknown',
  };
}

export function buildDataQuality(statuses: readonly AnalystSourceStatus[]): Record<string, string> {
  const quality: Record<string, string> = {};

  for (const status of statuses) {
    quality[status.source] = status.status;
  }

  return quality;
}

async function loadPostViewsSource(
  db: D1Database,
  window: AnalystWindow,
): Promise<{
  rows: AnalystPostRow[];
  windowViews: AnalystViewRow[];
  baselineViews: AnalystViewRow[];
  totalViews: number;
  status: AnalystSourceStatus;
}> {
  try {
    const [posts, windowViews, baselineViews, total] = await Promise.all([
      db
        .prepare(
          `SELECT id, title, category, body,
                  COALESCE(published_at, pub_date, created_at) AS published_at, updated_at
           FROM posts WHERE status = 'published' ORDER BY id ASC`,
        )
        .all<AnalystPostRow>(),
      db
        .prepare(
          `SELECT post_id, SUM(count) AS total FROM post_views
           WHERE day >= ? AND day <= ? GROUP BY post_id`,
        )
        .bind(window.start, window.end)
        .all<AnalystViewRow>(),
      db
        .prepare(
          `SELECT post_id, SUM(count) AS total FROM post_views
           WHERE day >= ? AND day <= ? GROUP BY post_id`,
        )
        .bind(window.baselineStart, window.baselineEnd)
        .all<AnalystViewRow>(),
      db
        .prepare(
          'SELECT COALESCE(SUM(count), 0) AS total FROM post_views WHERE day >= ? AND day <= ?',
        )
        .bind(window.start, window.end)
        .first<{ total: number }>(),
    ]);

    const rows = posts.results ?? [];

    return {
      rows,
      windowViews: windowViews.results ?? [],
      baselineViews: baselineViews.results ?? [],
      totalViews: total?.total ?? 0,
      status: {
        source: 'post_views',
        status: 'ok',
        detail: `Read ${rows.length} published posts and ${(windowViews.results ?? []).length} view groups for ${window.start} to ${window.end}.`,
        remediation: '',
        rowCount: rows.length,
      },
    };
  } catch (error) {
    return {
      rows: [],
      windowViews: [],
      baselineViews: [],
      totalViews: 0,
      status: errorStatus(
        'post_views',
        error,
        'Check that the posts and post_views tables exist and that migration 0025_post_views.sql has been applied.',
        0,
      ),
    };
  }
}

async function loadClicksSource(
  db: D1Database,
  window: AnalystWindow,
): Promise<{
  rows: AnalystProductRow[];
  clickRows: AnalystClickRow[];
  totalClicks: number;
  redirectMisses: RedirectMiss[];
  status: AnalystSourceStatus;
}> {
  try {
    const [products, clicks, total, redirectMisses] = await Promise.all([
      db
        .prepare(
          `SELECT p.id, p.slug, p.name, p.target, p.is_active, p.topics,
                  pr.id AS program_id, pr.name AS program_name, pr.network AS program_network,
                  pr.status AS program_status, pr.tracking_id AS program_tracking_id,
                  pr.link_template AS program_link_template, pr.disclosure AS program_disclosure
           FROM affiliate_products p
           LEFT JOIN affiliate_programs pr ON pr.id = p.program_id
           ORDER BY p.slug ASC`,
        )
        .all<AnalystProductRow>(),
      db
        .prepare(
          `SELECT product_id, COUNT(*) AS total FROM clicks
           WHERE created_at >= ? AND created_at < ?
           GROUP BY product_id`,
        )
        .bind(window.startIso, window.endExclusiveIso)
        .all<AnalystClickRow>(),
      db
        .prepare('SELECT COUNT(*) AS total FROM clicks WHERE created_at >= ? AND created_at < ?')
        .bind(window.startIso, window.endExclusiveIso)
        .first<{ total: number }>(),
      listRecentRedirectMisses(db, REDIRECT_MISS_SCAN_LIMIT),
    ]);

    const rows = products.results ?? [];

    return {
      rows,
      clickRows: clicks.results ?? [],
      totalClicks: total?.total ?? 0,
      redirectMisses,
      status: {
        source: 'clicks',
        status: 'ok',
        detail: `Read ${rows.length} products and ${(clicks.results ?? []).length} click groups for ${window.start} to ${window.end}.`,
        remediation: '',
        rowCount: rows.length,
      },
    };
  } catch (error) {
    return {
      rows: [],
      clickRows: [],
      totalClicks: 0,
      redirectMisses: [],
      status: errorStatus(
        'clicks',
        error,
        'Check that the clicks, affiliate_products, affiliate_programs, and redirect_misses tables exist and that migration 0026_clicks_placement.sql has been applied.',
        0,
      ),
    };
  }
}

async function readGscCredentialsSafely(
  db: D1Database,
  keyMaterial?: string,
): Promise<Awaited<ReturnType<typeof readGscCredentials>> | null> {
  try {
    return await readGscCredentials(db, keyMaterial);
  } catch (error) {
    console.error(
      '[analyst] could not read the Search Console credential',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function readGa4CredentialsSafely(
  db: D1Database,
  keyMaterial?: string,
): Promise<Awaited<ReturnType<typeof readGa4Credentials>> | null> {
  try {
    return await readGa4Credentials(db, keyMaterial);
  } catch (error) {
    console.error(
      '[analyst] could not read the GA4 credential',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function toAnalystGscSource(collection: GscCollection): AnalystGscSource {
  return {
    pages: collection.pages
      .filter((page) => page.postId !== null)
      .map((page) => ({
        postId: page.postId as string,
        impressions: page.impressions,
        clicks: page.clicks,
        positionSum: page.positionSum,
      })),
    queries: collection.queries.map((query) => ({
      query: query.query,
      impressions: query.impressions,
      clicks: query.clicks,
      positionSum: query.positionSum,
    })),
    rankedQueries: [
      ...new Set(
        collection.pageQueries
          .filter((row) => row.postId !== null)
          .map((row) => normalizeTopicTitle(row.query)),
      ),
    ],
    unmappedPages: collection.unmappedPages,
    truncated: collection.truncated,
  };
}

function describeGscCollection(collection: GscCollection, window: AnalystWindow): string {
  const parts = [
    `Read ${collection.pages.length} page row(s) and ${collection.queries.length} query row(s) for ${window.start} to ${window.end}.`,
  ];

  if (collection.unmappedPages.length > 0) {
    parts.push(
      `${collection.unmappedPages.length} page URL(s) did not map to a post: ${collection.unmappedPages.slice(0, 5).join(', ')}.`,
    );
  }

  if (collection.truncated.length > 0) {
    parts.push(`Truncated dimensions: ${collection.truncated.join(', ')}.`);
  }

  return parts.join(' ');
}

async function loadGscSource(
  db: D1Database,
  window: AnalystWindow,
  options: AnalystSourceLoadOptions,
): Promise<{ collection: AnalystGscSource; status: AnalystSourceStatus }> {
  const credentials = await readGscCredentialsSafely(db, options.keyMaterial);

  if (!credentials?.serviceAccount || !credentials.property) {
    return { collection: EMPTY_GSC_SOURCE, status: MISSING_SOURCES.gsc };
  }

  try {
    const accessToken = await resolveGoogleAccessToken({
      db,
      source: 'gsc',
      serviceAccount: credentials.serviceAccount,
      scope: GSC_SCOPE,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      now: options.now,
      keyMaterial: options.keyMaterial,
    });
    const collection = await collectSearchConsole({
      accessToken,
      property: credentials.property,
      startDate: window.start,
      endDate: window.end,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });

    return {
      collection: toAnalystGscSource(collection),
      status: {
        source: 'gsc',
        status: 'ok',
        detail: describeGscCollection(collection, window),
        remediation: '',
        rowCount: collection.rowCount,
      },
    };
  } catch (error) {
    return {
      collection: EMPTY_GSC_SOURCE,
      status: errorStatus('gsc', error, GSC_FAILURE_REMEDIATION, 0),
    };
  }
}

async function loadGa4Source(
  db: D1Database,
  window: AnalystWindow,
  windowViews: readonly AnalystViewRow[],
  options: AnalystSourceLoadOptions,
): Promise<AnalystSourceStatus> {
  const credentials = await readGa4CredentialsSafely(db, options.keyMaterial);

  if (!credentials?.serviceAccount || !credentials.propertyId) {
    return MISSING_SOURCES.ga4;
  }

  try {
    const accessToken = await resolveGoogleAccessToken({
      db,
      source: 'ga4',
      serviceAccount: credentials.serviceAccount,
      scope: GA4_SCOPE,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      now: options.now,
      keyMaterial: options.keyMaterial,
    });
    const collection = await collectGa4({
      accessToken,
      propertyId: credentials.propertyId,
      startDate: window.start,
      endDate: window.end,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });
    const firstPartyViews = new Map(
      windowViews.map((row) => [row.post_id ?? '', row.total] as const).filter(([id]) => id !== ''),
    );
    const crossCheck = compareGa4ToFirstParty(collection.rows, firstPartyViews);
    const parts = [
      `Read ${collection.rows.length} page path(s), ${collection.totals.sessions} session(s), and ${collection.totals.screenPageViews} page view(s) for ${window.start} to ${window.end}.`,
    ];

    if (collection.truncated) {
      parts.push('The report was truncated at the row cap.');
    }

    if (crossCheck.mismatches.length > 0) {
      const worst = crossCheck.mismatches[0];
      parts.push(
        `Cross-check warning: ${crossCheck.mismatches.length} of ${crossCheck.compared} matched page(s) differ from first-party views by more than ${GA4_VIEW_MISMATCH_FACTOR}x, worst ${worst.postId} at ${worst.ratio.toFixed(1)}x.`,
      );
    }

    return {
      source: 'ga4',
      status: 'ok',
      detail: parts.join(' '),
      remediation: '',
      rowCount: collection.rowCount,
    };
  } catch (error) {
    return errorStatus('ga4', error, GA4_FAILURE_REMEDIATION, 0);
  }
}

async function loadAffiliateReportSource(
  db: D1Database,
  window: AnalystWindow,
): Promise<{
  status: AnalystSourceStatus;
  coverage: CommissionCoverageState;
  commissions: AnalystCommissionRow[];
}> {
  try {
    const coverage = await readCommissionCoverage(db, window);

    if (coverage.state === 'unknown') {
      return { status: MISSING_SOURCES.affiliate_report, coverage: 'unknown', commissions: [] };
    }

    const [counts, commissions] = await Promise.all([
      readCommissionLineCounts(db, window),
      readCommissionByProduct(db, window),
    ]);
    const windowEnd = coverage.latestPeriodEnd ?? 'no report';

    return {
      status: {
        source: 'affiliate_report',
        status: 'ok',
        detail: `Read ${counts.lines} report line(s) covering ${coverage.coveredDays} of ${coverage.totalDays} window days (${coverage.state}); ${counts.unmatched} line(s) could not be matched to a product. Latest period ends ${windowEnd}.`,
        remediation: '',
        rowCount: counts.lines,
      },
      coverage: coverage.state,
      commissions,
    };
  } catch (error) {
    return {
      status: errorStatus('affiliate_report', error, REPORT_FAILURE_REMEDIATION, 0),
      coverage: 'unknown',
      commissions: [],
    };
  }
}

export async function loadAnalystSources(
  db: D1Database,
  window: AnalystWindow,
  options: AnalystSourceLoadOptions = {},
): Promise<AnalystSourceLoad> {
  const [clicks, postViews] = await Promise.all([
    loadClicksSource(db, window),
    loadPostViewsSource(db, window),
  ]);
  const [gsc, ga4, report] = await Promise.all([
    loadGscSource(db, window, options),
    loadGa4Source(db, window, postViews.windowViews, options),
    loadAffiliateReportSource(db, window),
  ]);

  const data = assembleAnalystData({
    window,
    posts: postViews.rows,
    windowViews: postViews.windowViews,
    baselineViews: postViews.baselineViews,
    totalViews: postViews.totalViews,
    totalClicks: clicks.totalClicks,
    products: clicks.rows,
    productClicks: clicks.clickRows,
    redirectMisses: clicks.redirectMisses,
    gsc: gsc.collection,
    commissionCoverage: report.coverage,
    productCommissions: report.commissions,
  });

  const statuses: AnalystSourceStatus[] = [
    clicks.status,
    postViews.status,
    gsc.status,
    ga4,
    report.status,
  ];

  return {
    data,
    statuses,
  };
}

export interface AnalystCredentialTestResult {
  ok: boolean;
  detail: string;
}

const CREDENTIAL_TEST_TIMEOUT_MS = 15_000;
const CREDENTIAL_TEST_RETRY = { attempts: 2, baseDelayMs: 250 };

export async function testGscCredentials(
  db: D1Database,
  options: AnalystSourceLoadOptions = {},
): Promise<AnalystCredentialTestResult> {
  const credentials = await readGscCredentialsSafely(db, options.keyMaterial);

  if (!credentials?.serviceAccount || !credentials.property) {
    return { ok: false, detail: 'No Search Console service account and property are saved.' };
  }

  try {
    const accessToken = await resolveGoogleAccessToken({
      db,
      source: 'gsc',
      serviceAccount: credentials.serviceAccount,
      scope: GSC_SCOPE,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      now: options.now,
      keyMaterial: options.keyMaterial,
      timeoutMs: CREDENTIAL_TEST_TIMEOUT_MS,
      retry: CREDENTIAL_TEST_RETRY,
    });
    const day = addViewDays(viewDayKey(options.now ?? new Date()), -1);
    const result = await querySearchAnalytics({
      accessToken,
      property: credentials.property,
      startDate: day,
      endDate: day,
      dimensions: ['query'],
      pageSize: 1,
      maxRows: 1,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      timeoutMs: CREDENTIAL_TEST_TIMEOUT_MS,
      retry: CREDENTIAL_TEST_RETRY,
    });

    return {
      ok: true,
      detail: `Google accepted the service account and returned ${result.rowCount} row(s) for ${credentials.property} on ${day}.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'The Search Console test failed.',
    };
  }
}

export async function testGa4Credentials(
  db: D1Database,
  options: AnalystSourceLoadOptions = {},
): Promise<AnalystCredentialTestResult> {
  const credentials = await readGa4CredentialsSafely(db, options.keyMaterial);

  if (!credentials?.serviceAccount || !credentials.propertyId) {
    return { ok: false, detail: 'No GA4 service account and property id are saved.' };
  }

  try {
    const accessToken = await resolveGoogleAccessToken({
      db,
      source: 'ga4',
      serviceAccount: credentials.serviceAccount,
      scope: GA4_SCOPE,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      now: options.now,
      keyMaterial: options.keyMaterial,
      timeoutMs: CREDENTIAL_TEST_TIMEOUT_MS,
      retry: CREDENTIAL_TEST_RETRY,
    });
    const day = addViewDays(viewDayKey(options.now ?? new Date()), -1);
    const result = await collectGa4({
      accessToken,
      propertyId: credentials.propertyId,
      startDate: day,
      endDate: day,
      pageSize: 1,
      maxRows: 1,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      timeoutMs: CREDENTIAL_TEST_TIMEOUT_MS,
      retry: CREDENTIAL_TEST_RETRY,
    });

    return {
      ok: true,
      detail: `Google accepted the service account and returned ${result.rowCount} page path(s) for GA4 property ${credentials.propertyId} on ${day}.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'The GA4 test failed.',
    };
  }
}
