import { ApiError } from '../../http';
import { type ImageSearchResult, searchImages } from '../search';
import { searchPexelsImages } from './pexels';

export const IMAGE_PROVIDER_IDS = ['pexels', 'openverse'] as const;

export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

export interface ImageSearchProvider {
  id: ImageProviderId;
  label: string;
  requiresKey: boolean;
}

export const IMAGE_PROVIDERS: ImageSearchProvider[] = [
  { id: 'pexels', label: 'Pexels', requiresKey: true },
  { id: 'openverse', label: 'Openverse', requiresKey: false },
];

export interface ImageSearchRequest {
  query: string;
  page: number;
  pexelsKey: string | null;
}

export interface ImageSearchResponse {
  results: ImageSearchResult[];
  total: number;
  provider: ImageProviderId;
}

export function isImageProviderId(value: string): value is ImageProviderId {
  return (IMAGE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function resolveImageProviderOrder(hasPexelsKey: boolean): ImageProviderId[] {
  return hasPexelsKey ? ['pexels', 'openverse'] : ['openverse'];
}

export function providerLabel(provider: ImageProviderId): string {
  return IMAGE_PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider;
}

async function searchWithProvider(
  provider: ImageProviderId,
  request: ImageSearchRequest,
): Promise<{ results: ImageSearchResult[]; total: number }> {
  if (provider === 'pexels') {
    if (!request.pexelsKey) {
      throw new ApiError(400, 'IMAGE_PROVIDER_KEY_MISSING', 'The Pexels API key is not set.');
    }

    return searchPexelsImages(request.query, request.page, request.pexelsKey);
  }

  return searchImages(request.query, request.page);
}

export async function searchImagesWithFallback(
  request: ImageSearchRequest,
): Promise<ImageSearchResponse> {
  const order = resolveImageProviderOrder(request.pexelsKey !== null);
  let firstError: unknown = null;
  let emptyResponse: ImageSearchResponse | null = null;

  for (const provider of order) {
    try {
      const response = await searchWithProvider(provider, request);

      if (response.results.length > 0) {
        return { ...response, provider };
      }

      emptyResponse = { ...response, provider };
    } catch (error) {
      firstError = firstError ?? error;
    }
  }

  if (emptyResponse) {
    return emptyResponse;
  }

  if (firstError) {
    throw firstError;
  }

  throw new ApiError(502, 'IMAGE_SEARCH_FAILED', 'The image search service is unavailable.');
}
