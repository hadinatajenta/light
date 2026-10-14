import { normalizeViewPath, postIdFromViewPath } from '../../analytics/views';
import {
  clampGoogleLimit,
  fetchGoogleJson,
  type GoogleRequestOptions,
  readGoogleNumber,
} from './google-auth';

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';
export const GSC_MAX_ROW_LIMIT = 25_000;
export const GSC_DEFAULT_PAGE_SIZE = 5_000;
export const GSC_DEFAULT_MAX_ROWS = 25_000;

export type GscDimensionName = 'page' | 'query' | 'page+query';

export interface GscApiRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}

export interface GscQueryResult {
  rows: GscApiRow[];
  truncated: boolean;
  rowCount: number;
}

export interface GscQueryInput extends GoogleRequestOptions {
  accessToken: string;
  property: string;
  startDate: string;
  endDate: string;
  dimensions: readonly string[];
  pageSize?: number;
  maxRows?: number;
  startRow?: number;
}

export interface GscPageMetric {
  pageUrl: string;
  postId: string | null;
  impressions: number;
  clicks: number;
  positionSum: number;
}

export interface GscQueryMetric {
  query: string;
  impressions: number;
  clicks: number;
  positionSum: number;
}

export interface GscPageQueryMetric {
  pageUrl: string;
  postId: string | null;
  query: string;
  impressions: number;
  clicks: number;
  positionSum: number;
}

export interface GscCollection {
  pages: GscPageMetric[];
  queries: GscQueryMetric[];
  pageQueries: GscPageQueryMetric[];
  unmappedPages: string[];
  truncated: GscDimensionName[];
  rowCount: number;
}

export interface CollectSearchConsoleInput extends GoogleRequestOptions {
  accessToken: string;
  property: string;
  startDate: string;
  endDate: string;
  pageSize?: number;
  maxRows?: number;
}

function readRows(payload: unknown): GscApiRow[] {
  const rows = (payload as { rows?: unknown }).rows;

  if (!Array.isArray(rows)) {
    return [];
  }

  const parsed: GscApiRow[] = [];

  for (const entry of rows) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const keys = Array.isArray(record.keys)
      ? record.keys.filter((key): key is string => typeof key === 'string')
      : [];

    if (keys.length === 0) {
      continue;
    }

    parsed.push({
      keys,
      clicks: readGoogleNumber(record.clicks),
      impressions: readGoogleNumber(record.impressions),
      position: readGoogleNumber(record.position),
    });
  }

  return parsed;
}

export function mapGscPageUrlToPostId(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  const schemeIndex = trimmed.indexOf('://');
  const withoutScheme =
    schemeIndex >= 0 ? trimmed.slice(schemeIndex + '://'.length) : trimmed.replace(/^\/\//, '');
  const firstSlash = withoutScheme.indexOf('/');
  const path = firstSlash >= 0 ? withoutScheme.slice(firstSlash) : '/';

  return postIdFromViewPath(normalizeViewPath(path));
}

export async function querySearchAnalytics(input: GscQueryInput): Promise<GscQueryResult> {
  const pageSize = clampGoogleLimit(input.pageSize ?? GSC_DEFAULT_PAGE_SIZE, 1, GSC_MAX_ROW_LIMIT);
  const maxRows = clampGoogleLimit(input.maxRows ?? GSC_DEFAULT_MAX_ROWS, 1, GSC_MAX_ROW_LIMIT);
  const url = `${GSC_API_BASE}/sites/${encodeURIComponent(input.property)}/searchAnalytics/query`;
  const rows: GscApiRow[] = [];
  let startRow = Math.max(input.startRow ?? 0, 0);
  let truncated = false;

  while (true) {
    const remaining = maxRows - rows.length;

    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const requestLimit = Math.min(pageSize, remaining);
    const payload = await fetchGoogleJson({
      url,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: [...input.dimensions],
        rowLimit: requestLimit,
        startRow,
      }),
      fetchImpl: input.fetchImpl,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      retry: input.retry,
    });
    const batch = readRows(payload);

    rows.push(...batch);
    startRow += batch.length;

    if (batch.length < requestLimit) {
      break;
    }

    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
  }

  return { rows, truncated, rowCount: rows.length };
}

async function queryDimension(
  input: CollectSearchConsoleInput,
  dimensions: readonly string[],
): Promise<GscQueryResult> {
  return querySearchAnalytics({
    accessToken: input.accessToken,
    property: input.property,
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions,
    pageSize: input.pageSize,
    maxRows: input.maxRows,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
    retry: input.retry,
  });
}

export async function collectSearchConsole(
  input: CollectSearchConsoleInput,
): Promise<GscCollection> {
  const [pages, queries, pageQueries] = await Promise.all([
    queryDimension(input, ['page']),
    queryDimension(input, ['query']),
    queryDimension(input, ['page', 'query']),
  ]);

  const unmapped = new Set<string>();

  const pageMetrics: GscPageMetric[] = pages.rows.map((row) => {
    const pageUrl = row.keys[0];
    const postId = mapGscPageUrlToPostId(pageUrl);

    if (!postId) {
      unmapped.add(pageUrl);
    }

    return {
      pageUrl,
      postId,
      impressions: row.impressions,
      clicks: row.clicks,
      positionSum: row.position * row.impressions,
    };
  });

  const queryMetrics: GscQueryMetric[] = queries.rows.map((row) => ({
    query: row.keys[0],
    impressions: row.impressions,
    clicks: row.clicks,
    positionSum: row.position * row.impressions,
  }));

  const pageQueryMetrics: GscPageQueryMetric[] = pageQueries.rows.map((row) => {
    const pageUrl = row.keys[0];
    const query = row.keys[1] ?? '';
    const postId = mapGscPageUrlToPostId(pageUrl);

    if (!postId) {
      unmapped.add(pageUrl);
    }

    return {
      pageUrl,
      postId,
      query,
      impressions: row.impressions,
      clicks: row.clicks,
      positionSum: row.position * row.impressions,
    };
  });

  const truncated: GscDimensionName[] = [];

  if (pages.truncated) {
    truncated.push('page');
  }
  if (queries.truncated) {
    truncated.push('query');
  }
  if (pageQueries.truncated) {
    truncated.push('page+query');
  }

  return {
    pages: pageMetrics,
    queries: queryMetrics,
    pageQueries: pageQueryMetrics,
    unmappedPages: [...unmapped],
    truncated,
    rowCount: pages.rowCount + queries.rowCount + pageQueries.rowCount,
  };
}
