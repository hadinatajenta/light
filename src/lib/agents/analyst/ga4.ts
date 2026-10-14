import { normalizeViewPath, postIdFromViewPath } from '../../analytics/views';
import { clampGoogleLimit, fetchGoogleJson, type GoogleRequestOptions } from './google-auth';

export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';
export const GA4_DEFAULT_PAGE_SIZE = 1_000;
export const GA4_DEFAULT_MAX_ROWS = 10_000;
export const GA4_MAX_ROW_LIMIT = 100_000;
export const GA4_VIEW_MISMATCH_FACTOR = 5;

export interface Ga4Row {
  pagePath: string;
  postId: string | null;
  sessions: number;
  screenPageViews: number;
}

export interface Ga4Collection {
  rows: Ga4Row[];
  totals: {
    sessions: number;
    screenPageViews: number;
  };
  truncated: boolean;
  rowCount: number;
}

export interface CollectGa4Input extends GoogleRequestOptions {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  pageSize?: number;
  maxRows?: number;
}

export interface Ga4ViewMismatch {
  postId: string;
  ga4Views: number;
  firstPartyViews: number;
  ratio: number;
}

export interface Ga4CrossCheck {
  compared: number;
  mismatches: Ga4ViewMismatch[];
}

function readMetricValue(value: unknown): number {
  const text = typeof value === 'string' ? value : '';
  const parsed = Number.parseInt(text, 10);

  return Number.isFinite(parsed) ? parsed : 0;
}

function readGa4Rows(payload: unknown): Ga4Row[] {
  const rows = (payload as { rows?: unknown }).rows;

  if (!Array.isArray(rows)) {
    return [];
  }

  const parsed: Ga4Row[] = [];

  for (const entry of rows) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const dimensionValues = Array.isArray(record.dimensionValues) ? record.dimensionValues : [];
    const metricValues = Array.isArray(record.metricValues) ? record.metricValues : [];
    const firstDimension = dimensionValues[0] as { value?: unknown } | undefined;
    const pagePath = typeof firstDimension?.value === 'string' ? firstDimension.value : '';

    if (pagePath === '') {
      continue;
    }

    const sessionValue = (metricValues[0] as { value?: unknown } | undefined)?.value;
    const pageViewValue = (metricValues[1] as { value?: unknown } | undefined)?.value;

    parsed.push({
      pagePath,
      postId: mapGa4PagePathToPostId(pagePath),
      sessions: readMetricValue(sessionValue),
      screenPageViews: readMetricValue(pageViewValue),
    });
  }

  return parsed;
}

export function mapGa4PagePathToPostId(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  return postIdFromViewPath(normalizeViewPath(trimmed));
}

export async function collectGa4(input: CollectGa4Input): Promise<Ga4Collection> {
  const pageSize = clampGoogleLimit(input.pageSize ?? GA4_DEFAULT_PAGE_SIZE, 1, GA4_MAX_ROW_LIMIT);
  const maxRows = clampGoogleLimit(input.maxRows ?? GA4_DEFAULT_MAX_ROWS, 1, GA4_MAX_ROW_LIMIT);
  const url = `${GA4_API_BASE}/properties/${encodeURIComponent(input.propertyId)}:runReport`;
  const rows: Ga4Row[] = [];
  let offset = 0;
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
        dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
        limit: requestLimit,
        offset,
        keepEmptyRows: false,
      }),
      fetchImpl: input.fetchImpl,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      retry: input.retry,
    });
    const batch = readGa4Rows(payload);

    rows.push(...batch);
    offset += batch.length;

    if (batch.length < requestLimit) {
      break;
    }

    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
  }

  return {
    rows,
    totals: {
      sessions: rows.reduce((total, row) => total + row.sessions, 0),
      screenPageViews: rows.reduce((total, row) => total + row.screenPageViews, 0),
    },
    truncated,
    rowCount: rows.length,
  };
}

export function compareGa4ToFirstParty(
  rows: readonly Ga4Row[],
  firstPartyViews: ReadonlyMap<string, number>,
  factor = GA4_VIEW_MISMATCH_FACTOR,
): Ga4CrossCheck {
  const mismatches: Ga4ViewMismatch[] = [];
  let compared = 0;

  for (const row of rows) {
    if (!row.postId) {
      continue;
    }

    const firstParty = firstPartyViews.get(row.postId) ?? 0;
    const ga4Views = row.screenPageViews;
    const ratio = Math.max(ga4Views, firstParty) / Math.max(Math.min(ga4Views, firstParty), 1);

    compared += 1;

    if (ratio > factor) {
      mismatches.push({ postId: row.postId, ga4Views, firstPartyViews: firstParty, ratio });
    }
  }

  mismatches.sort(
    (first, second) => second.ratio - first.ratio || first.postId.localeCompare(second.postId),
  );

  return { compared, mismatches };
}
