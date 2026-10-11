import { ApiError } from '../../errors';
import { fixtureProvider } from './fixture';
import { readSearchConfig } from './settings';
import { tavilyProvider } from './tavily';
import type { SearchProvider, SearchProviderId } from './types';

const PROVIDERS: Record<SearchProviderId, SearchProvider> = {
  tavily: tavilyProvider,
  fixture: fixtureProvider,
};

export function getSearchProvider(id: SearchProviderId): SearchProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new ApiError(422, 'SEARCH_PROVIDER_UNKNOWN', 'That search provider is not supported.');
  }

  return provider;
}

export interface ResolvedSearchProvider {
  provider: SearchProvider;
  apiKey: string | null;
}

export async function resolveSearchProvider(
  db: D1Database,
): Promise<ResolvedSearchProvider | null> {
  const config = await readSearchConfig(db);
  if (!config.providerId) {
    return null;
  }

  const provider = getSearchProvider(config.providerId);
  if (provider.requiresKey && !config.apiKey) {
    return null;
  }

  return { provider, apiKey: config.apiKey };
}
