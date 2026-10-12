import { ApiError } from '../../errors';
import type { SearchProvider, SearchQueryInput, SearchResult } from './types';

const ENDPOINT = 'https://api.tavily.com/search';
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 20;

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
}

interface TavilyResponse {
  results?: unknown;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toResult(entry: TavilyResult): SearchResult | null {
  const url = readString(entry.url);
  if (!url) {
    return null;
  }

  return {
    title: readString(entry.title) || url,
    url,
    snippet: readString(entry.content),
  };
}

function toStatusError(response: Response): ApiError {
  if (response.status === 401 || response.status === 403) {
    return new ApiError(401, 'SEARCH_UNAUTHORIZED', 'The search provider rejected the API key.');
  }

  if (response.status === 429) {
    return new ApiError(429, 'SEARCH_RATE_LIMITED', 'The search provider rate limit was reached.', {
      retryAfter: response.headers.get('Retry-After'),
    });
  }

  return new ApiError(
    502,
    'SEARCH_FAILED',
    `The search provider responded with status ${response.status}.`,
  );
}

export const tavilyProvider: SearchProvider = {
  id: 'tavily',
  label: 'Tavily',
  requiresKey: true,
  async search({
    query,
    limit,
    apiKey,
    signal,
    topic,
    days,
  }: SearchQueryInput): Promise<SearchResult[]> {
    if (!apiKey) {
      throw new ApiError(
        409,
        'SEARCH_KEY_MISSING',
        'The search provider API key is not configured.',
      );
    }

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          max_results: Math.min(Math.max(limit, 1), MAX_RESULTS),
          search_depth: 'basic',
          include_answer: false,
          include_raw_content: false,
          ...(topic ? { topic } : {}),
          ...(days ? { days } : {}),
        }),
        signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(502, 'SEARCH_UNREACHABLE', 'Could not reach the search provider.');
    }

    if (!response.ok) {
      throw toStatusError(response);
    }

    let payload: TavilyResponse;
    try {
      payload = (await response.json()) as TavilyResponse;
    } catch {
      throw new ApiError(502, 'SEARCH_FAILED', 'The search provider returned invalid data.');
    }

    const raw = Array.isArray(payload.results) ? (payload.results as TavilyResult[]) : [];

    return raw.map(toResult).filter((entry): entry is SearchResult => entry !== null);
  },
};
