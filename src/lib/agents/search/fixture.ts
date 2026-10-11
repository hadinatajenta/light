import { ApiError } from '../../errors';
import type { SearchProvider, SearchQueryInput, SearchResult } from './types';

async function readFixtureJson(): Promise<string | null> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env as unknown as { SEARCH_FIXTURE_JSON?: string }).SEARCH_FIXTURE_JSON ?? null;
  } catch {
    return null;
  }
}

function isResult(value: unknown): value is SearchResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { url?: unknown };
  return typeof candidate.url === 'string' && candidate.url.trim().length > 0;
}

export const fixtureProvider: SearchProvider = {
  id: 'fixture',
  label: 'Fixture (development)',
  requiresKey: false,
  async search({ limit }: SearchQueryInput): Promise<SearchResult[]> {
    const raw = await readFixtureJson();
    if (!raw) {
      throw new ApiError(
        409,
        'SEARCH_FIXTURE_EMPTY',
        'The search fixture is not configured. Set SEARCH_FIXTURE_JSON for local development.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError(500, 'SEARCH_FIXTURE_INVALID', 'The search fixture is not valid JSON.');
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isResult).slice(0, Math.max(limit, 0));
  },
};
