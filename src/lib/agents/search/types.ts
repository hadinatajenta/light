export const SEARCH_PROVIDER_IDS = ['tavily', 'fixture'] as const;

export type SearchProviderId = (typeof SEARCH_PROVIDER_IDS)[number];

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchQueryInput {
  query: string;
  limit: number;
  apiKey: string | null;
  signal?: AbortSignal;
}

export interface SearchProvider {
  id: SearchProviderId;
  label: string;
  requiresKey: boolean;
  search(input: SearchQueryInput): Promise<SearchResult[]>;
}

export function isSearchProviderId(value: string): value is SearchProviderId {
  return (SEARCH_PROVIDER_IDS as readonly string[]).includes(value);
}
